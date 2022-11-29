
import fs from 'fs'
import path from 'path'
import url from 'url'

/**
 * @param {{ car: string, offset: number, length: number }} - blockInfo
 */
function sizeofBlockInfo (blockInfo) {
  return blockInfo?.car?.length ? blockInfo.car.length * 2 + 16 : 0
}

function sleep (ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

function dirname (importMetaUrl) {
  return path.dirname(url.fileURLToPath(importMetaUrl))
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
      autoDialInterval: config.p2pConnectionAutoDialInterval
    },
    mplex: {
      maxInboundStreams: config.p2pConnectionMplexMaxInboundStreams,
      maxOutboundStreams: config.p2pConnectionMplexMaxOutboundStreams,
      maxStreamBufferSize: config.p2pConnectionMplexMaxStreamBufferSize
    },
    handler: {
      maxInboundStreams: config.p2pConnectionHandlerMaxInboundStreams,
      maxOutboundStreams: config.p2pConnectionHandlerMaxOutboundStreams
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(dirname(import.meta.url), '../package.json'), 'utf8'))
const version = packageJson.version

export { sizeofBlockInfo, sleep, dirname, createConnectionConfig, version }
