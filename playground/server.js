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

async function startService() {
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

  const queue = new Queue()

  service.handle('/custom', async ({ connection, stream, protocol }) => {
    pipe(stream.source, lengthPrefixedMessage.decode(), async source => {
      for await (const data of source) {
        try {
          const message = data.slice().toString()
          logger.info({ message }, '[SERVER] received a message')
          logger.info({ message: `REPLY[${message}]` }, '[SERVER] Sent a message')

          queue.push(`REPLY[${message}]`)
        } catch (e) {
          logger.error(`Callback error during receiveData: ${serializeError(e)}`)
        }
      }
    })

    pipe(queue, lengthPrefixedMessage.encode(), stream.sink)
  })

  await service.start()

  logger.info(
    { address: service.transportManager.getAddrs() },
    `BitSwap peer started with PeerId ${service.peerId} and listening on port ${port} ...`
  )

  return { service, port, peerId }
}

startService()
