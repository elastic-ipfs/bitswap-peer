
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { yamux } from '@chainsafe/libp2p-yamux'
import LRU from 'lru-cache'

import { noiseCrypto } from './noise-crypto.js'
import { Message, protocols } from 'e-ipfs-core-lib'
import { Connection } from './networking.js'
import { handle, createContext } from './handler.js'
import { telemetry } from './telemetry.js'
import { logger as defaultLogger } from './logging.js'
import { createPeerIdFromMultihash } from './peer-id.js'
import { denylistFilter } from './deny.js'
import { truncateWantlist } from './limit.js'

// TODO validate all the params
function validateParams ({ taggedPeers, logger }) {
  if (!taggedPeers) {
    // TODO move to debug
    logger.info('taggedPeers are empty')
    return {}
  }

  if (!Array.isArray(taggedPeers)) {
    logger.error({ taggedPeers }, 'invalid taggedPeers for libp2p')
    throw new Error('SERVICE_INVALID_TAGGED_PEERS')
  }

  let error
  const peers = []
  for (const taggedPeer of taggedPeers) {
    if (!taggedPeer?.name || !taggedPeer?.peer) {
      logger.error({ taggedPeer }, 'invalid taggedPeer, missing peer name or value')
      error = true
      continue
    }

    try {
      const peerId = createPeerIdFromMultihash(taggedPeer.peer)
      peers.push({ name: taggedPeer.name, value: taggedPeer.value, peerId })
    } catch (err) {
      logger.error({ taggedPeer, err }, 'invalid taggedPeer, unable to create peer for taggedPeer')
      error = true
    }
  }

  if (error) {
    throw new Error('SERVICE_INVALID_TAGGED_PEERS')
  }

  return { taggedPeers: peers }
}

async function startService ({ peerId, port, peerAnnounceAddr, awsClient, connectionConfig, logger = defaultLogger, taggedPeers, denylistUrl } = {}) {
  try {
    const validatedParams = validateParams({ taggedPeers, logger })
    const service = await createLibp2p({
      peerId,
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${port}/ws`],
        announce: peerAnnounceAddr ? [peerAnnounceAddr] : undefined
      },
      transports: [webSockets()],
      connectionEncryption: [noise({ crypto: noiseCrypto })],
      streamMuxers: [
        mplex({
          maxInboundStreams: connectionConfig.mplex.maxInboundStreams,
          maxOutboundStreams: connectionConfig.mplex.maxOutboundStreams,
          maxStreamBufferSize: connectionConfig.mplex.maxStreamBufferSize
        }),
        yamux({ client: false })
      ],
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

    // prevent closing connection from gateway
    // @see https://github.com/libp2p/js-libp2p/blob/master/doc/LIMITS.md#closing-connections
    if (validatedParams.taggedPeers) {
      for (const taggedPeer of validatedParams.taggedPeers) {
        const { name, peerId } = taggedPeer
        // TODO move to logger.debug
        logger.info({ name, peerId: peerId.toString() }, 'service add tagPeer to peerStore')
        await service.peerStore.tagPeer(taggedPeer.peerId, name, {
          value: taggedPeer.value ?? connectionConfig.taggedPeers.value
        })
      }
    }

    const cancelsPerPeer = new Map()
    service.addEventListener('error', err => {
      logger.warn({ err }, 'libp2p error event')
    })

    for (const protocol of protocols) {
      service.handle(protocol, async ({ connection: dial, stream }) => {
        try {
          const connection = new Connection(stream)
          let canceled = cancelsPerPeer.get(dial.remotePeer.toString())
          if (!canceled) {
            canceled = new LRU({ max: 200 })
            cancelsPerPeer.set(dial.remotePeer.toString(), canceled)
          }

          const hrTime = process.hrtime()
          const connectionId = hrTime[0] * 1000000000 + hrTime[1]

          // Open a send connection to the peer
          connection.on('data', async data => {
            let message

            try {
              message = Message.decode(data, protocol)
            } catch (err) {
              logger.warn({ err }, 'Cannot decode received data')
              return
            }

            // limit the number of cids we'll process from a single message. they can ask again.
            const { wantlist } = message
            wantlist.entries = truncateWantlist(wantlist.entries, 500)

            try {
              const count = wantlist.entries.length
              wantlist.entries = await denylistFilter(wantlist.entries, logger, denylistUrl)
              const diff = count - wantlist.entries.length
              if (diff > 0) {
                telemetry.increaseCount('bitswap-denied', diff)
              }
            } catch (err) {
              logger.error({ err }, 'Error filtering by denylist')
            }

            try {
              const context = createContext({
                service,
                peerId: dial.remotePeer,
                protocol,
                wantlist,
                awsClient,
                connectionId,
                canceled
              })
              process.nextTick(handle, { context, logger })
            } catch (err) {
              logger.error({ err }, 'Error creating context')
            }
          })

          // When the incoming duplex stream finishes sending, close for writing.
          // Note: we never write to this stream - responses are always sent on
          // another multiplexed stream.
          connection.on('end:receive', () => {
            connection.close()
          })

          connection.on('error', err => {
            // GC canceled LRU on error
            canceled.clear()
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
        telemetry.increaseCount('bitswap-connections')
        telemetry.increaseGauge('bitswap-active-connections')
      } catch (err) {
        logger.warn({ err, remotePeer: connection.detail.remotePeer.toString() }, 'Error while peer connecting')
      }
    })

    // TODO move to networking
    service.connectionManager.addEventListener('peer:disconnect', connection => {
      cancelsPerPeer.delete(
        connection.detail.remotePeer.toString()
      )
      try {
        telemetry.decreaseGauge('bitswap-active-connections')
      } catch (err) {
        logger.warn({ err, remotePeer: connection.detail.remotePeer.toString() }, 'Error while peer disconnecting')
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
