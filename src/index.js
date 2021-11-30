'use strict'

const { NOISE } = require('@chainsafe/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { blocksTable, getPeerId, primaryKeys, port } = require('./config')
const { logger, serializeError } = require('./logging')
const {
  Message,
  BITSWAP_V_100,
  BITSWAP_V_110,
  BITSWAP_V_120,
  Block,
  BlockPresence,
  Entry,
  WantList
} = require('./message')
const { receiveData, sendData } = require('./networking')
const { cidToKey, fetchS3Object, readDynamoItem } = require('./storage')

const emptyWantList = new WantList([], true)

async function fetchBlock(cid) {
  const info = await getBlockInfo(cid)

  if (!info) {
    return null
  }

  const { offset, length, car } = info.cars[0]
  const separator = car.indexOf('/')
  const bucket = car.slice(0, separator)
  const key = car.slice(separator + 1)

  return fetchS3Object(bucket, key, offset, length)
}

async function getBlockInfo(cid) {
  const item = await readDynamoItem(blocksTable, primaryKeys.blocks, cidToKey(cid))
  return item
}

async function processWantlist(stream, protocol, wantlist) {
  const blocks = []
  const presences = []

  // For each entry in the list
  for (const entry of wantlist.entries) {
    // We don't care about canceling wantlist since we don't maintain state
    if (entry.cancel) {
      continue
    }

    if (entry.wantType === Entry.WantType.Block) {
      // Fetch the block and eventually append to the list of blocks
      const raw = await fetchBlock(entry.cid)

      if (raw) {
        blocks.push(new Block(entry.cid, raw))
      } else if (entry.sendDontHave && protocol === BITSWAP_V_120) {
        presences.push(new BlockPresence(entry.cid, BlockPresence.Type.DontHave))
      }
    } else if (entry.wantType === Entry.WantType.Have && protocol === BITSWAP_V_120) {
      // Check if we have the block
      const existing = await getBlockInfo(entry.cid)

      if (existing) {
        presences.push(new BlockPresence(entry.cid, BlockPresence.Type.Have))
      } else if (entry.sendDontHave) {
        presences.push(new BlockPresence(entry.cid, BlockPresence.Type.DontHave))
      }
    }
  }

  // pendingBytes is always 0 as we don't maintain a state
  return new Message(emptyWantList, blocks, presences, 0)
}

async function main(currentPort) {
  const peerId = await getPeerId()

  if (!currentPort) {
    currentPort = port
  }

  const server = await libp2p.create({
    peerId,
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${currentPort}/ws`]
    },
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [NOISE]
    }
  })

  server.handle([BITSWAP_V_120, BITSWAP_V_110, BITSWAP_V_100], ({ connection, stream, protocol }) => {
    receiveData(stream, async data => {
      try {
        const message = Message.decode(data.slice(), protocol)
        const reply = await processWantlist(stream, protocol, message.wantlist)

        if (reply.hasData()) {
          await sendData(stream, reply.encode(protocol))
        } else {
          logger.debug('No reply sent to the client')
        }
      } catch (e) {
        // Nothing to report if we don't support the CID type
        if (e.message.startsWith('Invalid CID version')) {
          return
        }

        logger.error(`Invalid data received: ${serializeError(e)}`)
      }
    })
  })

  await server.start()

  logger.info(
    { address: server.transportManager.getAddrs() },
    `BitSwap peer started with PeerId ${server.peerId} and listening on port ${currentPort} ...`
  )

  return { server, port, peerId }
}

module.exports = { main }

if (!('TAP_CHILD_ID' in process.env)) {
  main().catch(logger.error.bind(logger))
}
