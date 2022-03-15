#!/usr/bin/env node

'use strict'

const { Noise } = require('@web3-storage/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')

const { port } = require('../src/config')
const { logger } = require('../src/logging')
const { Connection } = require('../src/networking')
const noiseCrypto = require('../src/noise-crypto')
const getPeerId = require('../src/peer-id')

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
      connEncryption: [new Noise(null, null, noiseCrypto)]
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
