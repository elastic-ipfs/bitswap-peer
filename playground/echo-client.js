#!/usr/bin/env node

import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'

import { logger } from '../src/logging.js'
import { Connection } from '../src/networking.js'
import { noiseCrypto } from '../src/noise-crypto.js'
import { getPeerId } from '../src/peer-id.js'

async function startClient () {
  const peerId = await getPeerId({})

  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncryption: [noise({ crypto: noiseCrypto })],
    streamMuxers: [mplex()]
  })

  const multiaddr = `/ip4/127.0.0.1/tcp/3000/ws/p2p/${peerId}`
  logger.info(`Connecting to server ${multiaddr} ...`)
  const dialConnection = await node.dial(multiaddr)
  const stream = await dialConnection.newStream('/custom')
  const connection = new Connection(stream)

  connection.on('data', data => {
    const message = data.toString('utf-8')
    logger.info({ message }, '[CLIENT] received a message')
  })

  connection.send(new Date().toISOString())
}

startClient()
