'use strict'

// TEMPORARY

const { Noise } = require('@web3-storage/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { CID } = require('multiformats/cid')

const { logger, serializeError } = require('../src/logging')
const { Connection } = require('../src/networking')
const { noiseCrypto } = require('../src/noise-crypto')
const { protocols, Entry, Message, WantList } = require('../src/protocol')

const durationUnits = {
  milliseconds: 1e6,
  seconds: 1e9
}

function elapsed(startTime, precision = 3, unit = 'milliseconds') {
  const dividend = durationUnits[unit] ?? durationUnits.milliseconds
  return (Number(process.hrtime.bigint() - startTime) / dividend).toFixed(precision)
}

async function connect({ multiaddr }) {
  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [new Noise(null, null, noiseCrypto)]
    }
  })

  // Connect to the BitSwap peer
  logger.info(`Connecting to ${multiaddr} ...`)
  const dialConnection = await node.dial(multiaddr)
  logger.info('Connected')

  const { stream, protocol } = await dialConnection.newStream(protocols)
  const duplex = new Connection(stream)

  return { node, protocol, duplex }
}

async function load() {
  return require('fs').readFileSync('/home/simone/Desktop/_ipfs/blocks', 'utf8')
    .split('\n')
    .map(c => c.trim())
    .filter(c => c)
    .map(c => CID.parse(c))
}

async function main({ multiaddr }) {
  const cids = await load()

  let toReceive = cids.length
  let dataReceived = 0

  const { node, protocol, duplex } = await connect({ multiaddr })

  // logger.info('Stream is ready.')

  const start = process.hrtime.bigint()
  let current = 0

  node.handle(protocols, async ({ connection: dialConnection, stream, protocol }) => {
    const connection = new Connection(stream)

    connection.on('data', async data => {
      const decoded = Message.decode(data)
      const blocks = decoded.blocks.length
      const presences = decoded.blockPresences.length

      // Update stats
      current++
      toReceive -= blocks + presences
      dataReceived += data.length

      logger.info(
        {
          timing: elapsed(start),
          current: current,
          currentSize: data.length,
          totalSize: dataReceived,
          blocks,
          presences,
          pending: toReceive
        },
        'Received response.'
      )

      if (toReceive <= 0) {
        logger.info('All data received, closing the connection.')
        await dialConnection.close()
      }
    })

    connection.on('error', error => {
      logger.error({ error }, `Connection error: ${serializeError(error)}`)
    })
  })

  // Send the only request
  duplex.send(
    new Message(
      new WantList(
        cids.map(c => new Entry(c, 1, false, Entry.WantType.Block, true)),
        false
      ),
      [],
      [],
      0
    ).encode(protocol)
  )

  // logger.info('Request sent.')
}

main({
  multiaddr: process.argv[2]
})
