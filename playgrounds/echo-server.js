#!/usr/bin/env node

'use strict'

const { NOISE } = require('@chainsafe/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')

const { getPeerId, port } = require('../src/config')
const { logger } = require('../src/logging')
const { Connection } = require('../src/networking')

async function startServer() {
  const peerId = await getPeerId()

  const service = await libp2p.create({
    peerId,
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}/ws`]
    },
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [NOISE]
    }
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
    { address: service.transportManager.getAddrs() },
    `Peer started with PeerId ${service.peerId} and listening on port ${port} ...`
  )
}

startServer()
