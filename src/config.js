'use strict'

const { join, resolve } = require('path')

/* c8 ignore next */
require('dotenv').config({ path: process.env.ENV_FILE_PATH || resolve(process.cwd(), '.env') })

const {
  CACHE_BLOCKS_INFO: cacheBlocksInfo,
  CONCURRENCY: rawConcurrency,
  DYNAMO_BLOCKS_TABLE: blocksTable,
  DYNAMO_CARS_TABLE: carsTable,
  PEER_ID_DIRECTORY: peerIdJsonDirectory,
  PEER_ID_FILE: peerIdJsonFile,
  PIPELINING: rawPipelining,
  PORT: rawPort,
  TELEMETRY_PORT: rawTelemetryPort
} = process.env

const concurrency = parseInt(rawConcurrency)
const pipelining = parseInt(rawPipelining)
const port = parseInt(rawPort)
const telemetryPort = parseInt(rawTelemetryPort)

module.exports = {
  blocksTable: blocksTable ?? 'blocks',
  cacheBlocksInfo: cacheBlocksInfo !== 'false',
  carsTable: carsTable ?? 'cars',
  concurrency: !isNaN(concurrency) && concurrency > 0 ? concurrency : 128,
  peerIdJsonFile,
  peerIdJsonPath: join(peerIdJsonDirectory ?? '/tmp', peerIdJsonFile ?? 'peerId.json'),
  pipelining: !isNaN(pipelining) && pipelining > 0 ? pipelining : 16,
  primaryKeys: {
    blocks: 'multihash',
    cars: 'path'
  },
  port: !isNaN(port) && port > 0 ? port : 3000,
  telemetryPort: !isNaN(telemetryPort) && telemetryPort > 0 ? telemetryPort : 3001
}
