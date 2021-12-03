'use strict'

const { NOISE } = require('@chainsafe/libp2p-noise')
const lengthPrefixedMessage = require('it-length-prefixed')
const pipe = require('it-pipe')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')

const { getPeerId, port } = require('../src/config')
const { logger, serializeError } = require('../src/logging')
const { Queue } = require('../src/networking')

async function client() {
  const peerId = await getPeerId()

  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [NOISE]
    }
  })

  const connection = await node.dial(`/ip4/127.0.0.1/tcp/${port}/ws/p2p/${peerId}`)
  const { stream } = await connection.newStream('/custom')

  pipe(stream.source, lengthPrefixedMessage.decode(), async source => {
    for await (const data of source) {
      try {
        const message = data.slice().toString()
        logger.info({ message }, '[CLIENT] received a message')
      } catch (e) {
        logger.error(`Callback error during receiveData: ${serializeError(e)}`)
      }
    }
  })

  const queue = new Queue()
  pipe(queue, lengthPrefixedMessage.encode(), stream.sink)

  queue.push('A')
  queue.push('B')
  queue.push('C')
}

client()
