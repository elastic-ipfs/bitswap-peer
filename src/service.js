
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'

import { noiseCrypto } from './noise-crypto.js'
import config from './config.js'
import { Message, protocols } from 'e-ipfs-core-lib'
import { Connection } from './networking.js'
import { startKeepAlive, stopKeepAlive } from './p2p-keep-alive.js'
import { handle, createContext } from './handler.js'
import { telemetry } from './telemetry.js'
import { logger as defaultLogger } from './logging.js'
import inspect from './inspect/index.js'

async function startService ({ peerId, port, peerAnnounceAddr, awsClient, connectionConfig, logger = defaultLogger } = {}) {
  try {
    // TODO params validation

    const service = await createLibp2p({
      peerId,
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${port}/ws`],
        announce: peerAnnounceAddr ? [peerAnnounceAddr] : undefined
      },
      transports: [webSockets()],
      connectionEncryption: [noise({ crypto: noiseCrypto })],
      streamMuxers: [mplex({
        maxInboundStreams: connectionConfig.mplex.maxInboundStreams,
        maxOutboundStreams: connectionConfig.mplex.maxOutboundStreams,
        maxStreamBufferSize: connectionConfig.mplex.maxStreamBufferSize
      })],
      connectionManager: {
        maxConnections: connectionConfig.p2p.maxConnections,
        minConnections: connectionConfig.p2p.minConnections,
        pollInterval: connectionConfig.p2p.pollInterval,
        inboundConnectionThreshold: connectionConfig.p2p.inboundConnectionThreshold,
        maxIncomingPendingConnections: connectionConfig.p2p.maxIncomingPendingConnections,
        inboundUpgradeTimeout: connectionConfig.p2p.inboundUpgradeTimeout,
        autoDial: connectionConfig.p2p.autoDial,
        autoDialInterval: connectionConfig.p2p.autoDialInterval
      }
    })

    const handlerOptions = {
      maxInboundStreams: connectionConfig.handler.maxInboundStreams,
      maxOutboundStreams: connectionConfig.handler.maxOutboundStreams
    }

    service.addEventListener('error', err => {
      logger.warn({ err }, 'libp2p')
    })

    for (const protocol of protocols) {
      service.handle(protocol, async ({ connection: dial, stream }) => {
        try {
          const connection = new Connection(stream)

          // Open a send connection to the peer
          connection.on('data', data => {
            let message

            try {
              message = Message.decode(data, protocol)
            } catch (err) {
              logger.warn({ err }, 'Cannot decode received data')
              return
            }

            try {
              const context = createContext({ service, peerId: dial.remotePeer, protocol, wantlist: message.wantlist, awsClient })
              process.nextTick(handle, { context, logger })
            } catch (err) {
              logger.error({ err }, 'Error creating context')
            }
          })

          // When the incoming duplex stream finishes sending, close for writing.
          // Note: we never write to this stream - responses are always sent on
          // another multiplexed stream.
          connection.on('end:receive', () => connection.close())

          connection.on('error', err => {
            logger.error({ err, dial, stream, protocol }, 'Connection error')
          })
        } catch (err) {
          logger.error({ err, dial, stream, protocol }, 'Error while creating connection')
        }
      }, handlerOptions)
    }

    // TODO move to networking
    service.connectionManager.addEventListener('peer:connect', connection => {
      try {
        if (config.enableKeepAlive) { startKeepAlive(connection.remotePeer, service) }
        telemetry.increaseCount('bitswap-total-connections')
        inspect.metrics.increase('connections')
      } catch (err) {
        logger.warn({ err, remotePeer: connection.remotePeer }, 'Error while peer connecting')
      }
    })

    // TODO move to networking
    service.connectionManager.addEventListener('peer:disconnect', connection => {
      try {
        if (config.enableKeepAlive) { stopKeepAlive(connection.remotePeer) }
        telemetry.decreaseCount('bitswap-total-connections')
        inspect.metrics.decrease('connections')
      } catch (err) {
        logger.warn({ err, remotePeer: connection.remotePeer }, 'Error while peer disconnecting')
      }
    })

    // TODO move to networking
    service.connectionManager.addEventListener('error', err => {
      logger.error({ err }, 'libp2p connectionManager.error')
    })

    await service.start()

    logger.info(
      {
        address: service.components.transportManager.getAddrs(),
        peerId: service.peerId.toString(),
        port
      },
      'BitSwap peer started'
    )

    logger.info(service.components.transportManager.getAddrs()
      .map(a => `${a}/${service.peerId}`)
      .join('\n')
    )

    return { service, port, peerId }
  } catch (err) {
    logger.error({ err }, 'error on start service')
    throw err
  }
}

export { startService }
