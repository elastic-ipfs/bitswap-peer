'use strict'

const { join, resolve } = require('path')
const PeerId = require('peer-id')
const { readFile, writeFile } = require('fs/promises')

/* c8 ignore next */
require('dotenv').config({ path: process.env.ENV_FILE_PATH || resolve(process.cwd(), '.env') })

const { logger } = require('./logging')
const { fetchS3Object } = require('./storage')

const {
  CACHE_BLOCKS_INFO: cacheBlocksInfo,
  CONCURRENCY: rawConcurrency,
  DYNAMO_BLOCKS_TABLE: blocksTable,
  DYNAMO_CARS_TABLE: carsTable,
  PEER_ID_DIRECTORY: peerIdJsonDirectory,
  PEER_ID_FILE: peerIdJsonFile,
  PORT: rawPort,
  TELEMETRY_PORT: rawTelemetryPort
} = process.env

async function downloadPeerIdFile() {
  const file = peerIdJsonFile ?? 'peerId.json'
  logger.info(`Downloading PeerId from s3://${process.env.PEER_ID_S3_BUCKET}/${file}`)

  const contents = await fetchS3Object(process.env.PEER_ID_S3_BUCKET, file)
  return writeFile(module.exports.peerIdJsonPath, contents)
}

async function getPeerId() {
  if (process.env.PEER_ID_S3_BUCKET) {
    await downloadPeerIdFile()
  }

  try {
    const peerIdJson = JSON.parse(await readFile(module.exports.peerIdJsonPath, 'utf-8'))
    return await PeerId.createFromJSON(peerIdJson)
  } catch (e) {
    return PeerId.create()
  }
}

const concurrency = parseInt(rawConcurrency)
const port = parseInt(rawPort)

module.exports = {
  blocksTable: blocksTable ?? 'blocks',
  cacheBlocksInfo: cacheBlocksInfo !== 'false',
  carsTable: carsTable ?? 'cars',
  concurrency: !isNaN(concurrency) && concurrency > 0 ? concurrency : 16,
  getPeerId,
  peerIdJsonPath: join(peerIdJsonDirectory ?? '/tmp', peerIdJsonFile ?? 'peerId.json'),
  primaryKeys: {
    blocks: 'multihash',
    cars: 'path'
  },
  port: !isNaN(port) && port > 0 ? port : 3000,
  telemetryPort: !isNaN(rawTelemetryPort) && rawTelemetryPort > 0 ? rawTelemetryPort : 3001
}
