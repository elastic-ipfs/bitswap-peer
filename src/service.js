'use strict'

const { Noise } = require('@web3-storage/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')

const { getPeerId } = require('../src/peer-id')
const { enableKeepAlive, port, peerAnnounceAddr } = require('./config')
const { logger: defaultLogger, serializeError } = require('./logging')
const { Connection } = require('./networking')
const { noiseCrypto } = require('./noise-crypto')
const { startKeepAlive, stopKeepAlive } = require('./p2p-keep-alive.js')
const { Message, protocols } = require('./protocol')
const { telemetry } = require('./telemetry')
const { handle } = require('./handler')

async function startService({ peerId, currentPort, announceAddr, logger = defaultLogger } = {}) {
  try {
    if (!peerId) {
      peerId = await getPeerId()
    }

    if (!currentPort) {
      currentPort = port
    }

    if (!announceAddr) {
      announceAddr = peerAnnounceAddr
    }

    const service = await libp2p.create({
      peerId,
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${currentPort}/ws`],
        announce: announceAddr ? [announceAddr] : undefined
      },
      modules: {
        transport: [Websockets],
        streamMuxer: [Multiplex],
        connEncryption: [new Noise(null, null, noiseCrypto)]
      }
    })

    service.on('error', err => {
      logger.warn({ err }, `libp2p error: ${serializeError(err)}`)
    })

    service.handle(protocols, async ({ connection: dial, stream, protocol }) => {
      try {
        const connection = new Connection(stream)

        // Open a send connection to the peer
        connection.on('data', data => {
          let message
          try {
            message = Message.decode(data, protocol)
          } catch (err) {
            logger.warn({ err: serializeError(err) }, 'Cannot decode received data')
            service.emit('error:receive', err)
            // TODO close connection
            // TODO add? telemetry.increaseCount('bitswap-block-error')
            return
          }

          let context
          try {
            context = {
              service,
              peer: dial.remotePeer,
              protocol,
              blocks: message.wantlist.entries
            }
          } catch (err) {
            logger.warn({ err: serializeError(err) }, 'Error while preparing request context')
            // TODO close connection
            // TODO add? telemetry.increaseCount('bitswap-block-error')
            return
          }

          handle({ context, logger })
        })

        // When the incoming duplex stream finishes sending, close for writing.
        // Note: we never write to this stream - responses are always sent on
        // another multiplexed stream.
        connection.on('end:receive', () => connection.close())

        /* c8 ignore next 4 */
        connection.on('error', err => {
          logger.error({ err, dial, stream, protocol }, `Connection error: ${serializeError(err)}`)
          service.emit('error:connection', err)
        })
      } catch (err) {
        logger.error({ err, dial, stream, protocol }, `Error while creating connection: ${serializeError(err)}`)
      }
    })

    service.connectionManager.on('peer:connect', connection => {
      try {
        if (enableKeepAlive) { startKeepAlive(connection.remotePeer, service) }
        telemetry.increaseCount('bitswap-total-connections')
        telemetry.increaseCount('bitswap-active-connections')
      } catch (err) {
        logger.warn({ err, remotePeer: connection.remotePeer }, `Error while peer connecting: ${serializeError(err)}`)
      }
    })

    service.connectionManager.on('peer:disconnect', connection => {
      try {
        if (enableKeepAlive) { stopKeepAlive(connection.remotePeer) }
        telemetry.decreaseCount('bitswap-active-connections')
      } catch (err) {
        logger.warn({ err, remotePeer: connection.remotePeer }, `Error while peer disconnecting: ${serializeError(err)}`)
      }
    })

    service.connectionManager.on('error', err => {
      logger.error({ err }, `libp2p connectionManager.error: ${serializeError(err)}`)
    })

    await service.start()

    logger.info(
      { address: service.transportManager.getAddrs() },
      `BitSwap peer started with PeerId ${service.peerId} and listening on port ${currentPort} ...`
    )

    return { service, port: currentPort, peerId }
    /* c8 ignore next 3 */
  } catch (err) {
    logger.error({ err }, 'Error on service')
  }
}

module.exports = { startService }
