'use strict'

const { Noise } = require('@web3-storage/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const LRUCache = require('mnemonist/lru-cache')
const pMap = require('p-map')
const { cacheBlocksInfo, concurrency, blocksTable, getPeerId, primaryKeys, port } = require('./config')
const { logger, serializeError } = require('./logging')
const { Connection } = require('./networking')
const noiseCrypto = require('./noise-crypto')
const {
  BITSWAP_V_120,
  Block,
  BlockPresence,
  Entry,
  Message,
  protocols,
  emptyWantList,
  maxBlockSize
} = require('./protocol')
const { cidToKey, fetchS3Object, readDynamoItem } = require('./storage')
const telemetry = require('./telemetry')

const blocksCache = new LRUCache(1e6)

function createEmptyMessage(blocks = [], presences = []) {
  return new Message(emptyWantList, blocks, presences, 0)
}

async function getBlockInfo(cid) {
  const key = cidToKey(cid)
  const cached = blocksCache.get(key)

  if (cacheBlocksInfo && cached) {
    return cached
  }

  telemetry.increaseCount('dynamo-reads')
  const item = await telemetry.trackDuration('dynamo-reads', readDynamoItem(blocksTable, primaryKeys.blocks, key))

  if (item) {
    blocksCache.set(key, item)
  }

  return item
}

async function fetchBlock(cid) {
  const info = await getBlockInfo(cid)

  if (!info) {
    return null
  }

  const { offset, length, car } = info.cars[0]

  if (length > maxBlockSize) {
    return null
  }

  const separator = car.indexOf('/')
  const bucket = car.slice(0, separator)
  const key = car.slice(separator + 1)

  return fetchS3Object(bucket, key, offset, length)
}

async function sendMessage(context, encodedMessage) {
  if (!context.connection) {
    telemetry.increaseCount('bitswap-total-connections')
    telemetry.increaseCount('bitswap-active-connections')

    const dialConnection = await context.service.dial(context.peer)
    const { stream } = await dialConnection.newStream(context.protocol)
    context.connection = new Connection(stream)
  }

  context.connection.send(encodedMessage)
}

async function processWantlist(wantlist, context) {
  let message = createEmptyMessage()
  telemetry.increaseCount('bitswap-total-entries', wantlist.entries.length)
  telemetry.increaseCount('bitswap-pending-entries', wantlist.entries.length)

  // For each entry in the list
  await pMap(
    wantlist.entries,
    async entry => {
      // We don't care about canceling wantlist since we don't maintain state
      if (entry.cancel) {
        return
      }

      let newBlock
      let newPresence

      if (entry.wantType === Entry.WantType.Block) {
        // Fetch the block and eventually append to the list of blocks
        const raw = await fetchBlock(entry.cid)

        if (raw) {
          telemetry.increaseCount('bitswap-block-hits')
          telemetry.increaseCount('bitswap-sent-data', raw.length)
          newBlock = new Block(entry.cid, raw)
        } else if (entry.sendDontHave && context.protocol === BITSWAP_V_120) {
          telemetry.increaseCount('bitswap-block-misses')
          newPresence = new BlockPresence(entry.cid, BlockPresence.Type.DontHave)
        }
      } else if (entry.wantType === Entry.WantType.Have && context.protocol === BITSWAP_V_120) {
        // Check if we have the block
        const existing = await getBlockInfo(entry.cid)

        if (existing) {
          telemetry.increaseCount('bitswap-block-hits')
          newPresence = new BlockPresence(entry.cid, BlockPresence.Type.Have)
        } else if (entry.sendDontHave) {
          telemetry.increaseCount('bitswap-block-misses')
          newPresence = new BlockPresence(entry.cid, BlockPresence.Type.DontHave)
        }
      }

      /*
        In the if-else below, addBlock and addPresence returns false if adding
        the element would make the serialized message exceed the maximum allowed size.

        In that case, we send the message without the new element and prepare a new message.

        The reason why don't encode the message to send in sendMessage is because we need to
        create a new message before sending is actually tried.
        This is to avoid a race condition (and duplicate data sent) in environments when remote peer download
        speed is comparable to Dynamo+S3 read time. (e.g. inter AWS peers).
      */
      if (newBlock) {
        if (!message.addBlock(newBlock, context.protocol)) {
          const toSend = message.encode(context.protocol)
          message = createEmptyMessage([newBlock])
          await sendMessage(context, toSend)
        }
      } else if (newPresence) {
        if (!message.addBlockPresence(newPresence, context.protocol)) {
          const toSend = message.encode(context.protocol)
          message = createEmptyMessage([], [newPresence])
          await sendMessage(context, toSend)
        }
      }
    },
    { concurrency }
  )

  telemetry.decreaseCount('bitswap-pending-entries', wantlist.entries.length)

  // Once we have processed all blocks, see if there is anything else to send
  if (message.blocks.length || message.blockPresences.length) {
    await sendMessage(context, message.encode(context.protocol))
  }

  if (context.connection) {
    telemetry.decreaseCount('bitswap-active-connections')
    await context.connection.close()
  }
}

async function startService(currentPort) {
  const peerId = await getPeerId()

  if (!currentPort) {
    currentPort = port
  }

  const service = await libp2p.create({
    peerId,
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${currentPort}/ws`]
    },
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [new Noise(null, null, noiseCrypto)]
    }
  })

  service.handle(protocols, async ({ connection: dial, stream, protocol }) => {
    const connection = new Connection(stream)

    // Open a send connection to the peer
    connection.on('data', data => {
      let message

      try {
        message = Message.decode(data, protocol)
      } catch (error) {
        logger.error({ error }, `Invalid data received: ${serializeError(error)}`)
        service.emit('error:receive', error)
        return
      }

      processWantlist(message.wantlist, { service, peer: dial.remotePeer, protocol })
    })

    /* c8 ignore next 4 */
    connection.on('error', error => {
      logger.error({ error }, `Connection error: ${serializeError(error)}`)
      service.emit('error:connection', error)
    })
  })

  service.connectionManager.on('peer:connect', connection => {
    telemetry.increaseCount('bitswap-total-connections')
    telemetry.increaseCount('bitswap-active-connections')
  })

  service.connectionManager.on('peer:disconnect', connection => {
    telemetry.decreaseCount('bitswap-active-connections')
  })

  await service.start()

  logger.info(
    { address: service.transportManager.getAddrs() },
    `BitSwap peer started with PeerId ${service.peerId} and listening on port ${currentPort} ...`
  )

  return { service, port: currentPort, peerId }
}

module.exports = { startService }
