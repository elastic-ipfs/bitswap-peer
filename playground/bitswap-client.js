#!/usr/bin/env node

import fs from 'fs'
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { CID } from 'multiformats/cid'
import { logger, serializeError } from '../src/logging.js'
import { Connection } from '../src/networking.js'
import { noiseCrypto } from '../src/noise-crypto.js'
import { protocols, Entry, Message, WantList } from '../src/protocol.js'

const durationUnits = {
  milliseconds: 1e6,
  seconds: 1e9
}

const allCids = fs.readFileSync(process.argv[3], 'utf-8')
  .split('\n')
  .map(c => c.trim())
  .filter(c => c)
  .map(c => CID.parse(c))

function elapsed (startTime, precision = 3, unit = 'milliseconds') {
  const dividend = durationUnits[unit] ?? durationUnits.milliseconds
  return (Number(process.hrtime.bigint() - startTime) / dividend).toFixed(precision)
}

async function client () {
  let start = process.hrtime.bigint()

  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncryption: [noise({ crypto: noiseCrypto })],
    streamMuxers: [mplex()]
  })

  // Connect to the BitSwap peer
  const multiaddr = process.argv[2]
  logger.info(`Connecting to ${multiaddr} ...`)
  const dialConnection = await node.dial(multiaddr)
  logger.info(`Connected in ${elapsed(start)} ms.`)

  const stream = await dialConnection.newStream(protocols)
  const duplex = new Connection(stream)

  let dataReceived = 0
  let toReceive = allCids.length

  logger.info('Stream is ready.')

  // Start communication
  start = process.hrtime.bigint()
  let current = 0

  node.handle(protocols, async ({ connection: dialConnection, stream }) => {
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
          current,
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
        allCids.map(c => new Entry(c, 1, false, Entry.WantType.Block, true)),
        false
      ),
      [],
      [],
      0
    ).encode(stream.stat.protocol)
  )

  logger.info('Request sent.')
}

client()
