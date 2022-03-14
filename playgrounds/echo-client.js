#!/usr/bin/env node

'use strict'

const { Noise } = require('@web3-storage/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')

const { getPeerId } = require('../src/config')
const { logger } = require('../src/logging')
const { Connection } = require('../src/networking')
const noiseCrypto = require('../src/noise-crypto')

async function startClient() {
  const peerId = await getPeerId()

  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [new Noise(null, null, noiseCrypto)]
    }
  })

  const multiaddr = `/ip4/127.0.0.1/tcp/3000/ws/p2p/${peerId}`
  logger.info(`Connecting to server ${multiaddr} ...`)
  const dialConnection = await node.dial(multiaddr)
  const { stream } = await dialConnection.newStream('/custom')
  const connection = new Connection(stream)

  connection.on('data', data => {
    const message = data.toString('utf-8')
    logger.info({ message }, '[CLIENT] received a message')
  })

  connection.send(new Date().toISOString())
}

startClient()
