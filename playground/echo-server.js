#!/usr/bin/env node

import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'

import config from '../src/config.js'
import { logger } from '../src/logging.js'
import { Connection } from '../src/networking.js'
import { noiseCrypto } from '../src/noise-crypto.js'
import { getPeerId } from '../src/peer-id.js'

async function startServer () {
  const peerId = await getPeerId({})

  const service = await createLibp2p({
    peerId,
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${config.port}/ws`]
    },
    transports: [webSockets()],
    connectionEncryption: [noise({ crypto: noiseCrypto })],
    streamMuxers: [mplex()]
  })

  service.handle('/custom', async ({ connection: dial, stream, protocol }) => {
    const connection = new Connection(stream)

    // Open a send connection to the peer
    connection.on('data', data => {
      const message = data.toString('utf-8')
      const reply = `REPLY[${message}]`
      logger.info({ message }, '[SERVER] received a message')
      logger.info({ reply }, '[SERVER] Sent a message')
      connection.send(reply)
    })
  })

  await service.start()

  logger.info(
    { address: service.components.transportManager.getAddrs() },
    `Peer started with PeerId ${service.peerId} and listening on port ${config.port} ...`
  )
}

startServer()
