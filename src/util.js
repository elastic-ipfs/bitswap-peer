
import path from 'path'
import { dirname, version as getVersion } from 'e-ipfs-core-lib'

/**
 * @param {{ car: string, offset: number, length: number }} - blockInfo
 */
function sizeofBlockInfo (blockInfo) {
  return blockInfo?.car?.length ? blockInfo.car.length * 2 + 16 : 0
}

function sleep (ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

function createConnectionConfig (config) {
  return {
    p2p: {
      maxConnections: config.p2pConnectionMaxConnections,
      minConnections: config.p2pConnectionMinConnections,
      pollInterval: config.p2pConnectionPollInterval,
      inboundConnectionThreshold: config.p2pConnectionInboundConnectionThreshold,
      maxIncomingPendingConnections: config.p2pConnectionMaxIncomingPendingConnections,
      inboundUpgradeTimeout: config.p2pConnectionInboundUpgradeTimeout,
      autoDial: config.p2pConnectionAutoDial,
      autoDialInterval: config.p2pConnectionAutoDialInterval,
      allow: config.p2pConnectionAllow
    },
    mplex: {
      maxInboundStreams: config.p2pConnectionMplexMaxInboundStreams,
      maxOutboundStreams: config.p2pConnectionMplexMaxOutboundStreams,
      maxStreamBufferSize: config.p2pConnectionMplexMaxStreamBufferSize
    },
    handler: {
      maxInboundStreams: config.p2pConnectionHandlerMaxInboundStreams,
      maxOutboundStreams: config.p2pConnectionHandlerMaxOutboundStreams
    },
    taggedPeers: {
      value: config.p2pConnectionTaggedPeersValue
    }
  }
}

const version = getVersion(path.join(dirname(import.meta.url), '../package.json'))

export { sizeofBlockInfo, sleep, createConnectionConfig, version }
