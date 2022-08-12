'use strict'

const { join, resolve } = require('path')

/* c8 ignore next */
require('dotenv').config({ path: process.env.ENV_FILE_PATH || resolve(process.cwd(), '.env') })

const {
  CACHE_BLOCKS_INFO: cacheBlocksInfo,
  CACHE_BLOCKS_INFO_SIZE: cacheBlocksInfoSize,

  CACHE_BLOCK_DATA: cacheBlockData,
  CACHE_BLOCK_DATA_SIZE: cacheBlockDataSize,

  CONCURRENCY: rawConcurrency,

  DYNAMO_BLOCKS_TABLE: blocksTable,
  DYNAMO_CARS_TABLE: carsTable,
  DYNAMO_BLOCKS_TABLE_V1: blocksTableV1,
  DYNAMO_CARS_TABLE_V1: carsTableV1,
  DYNAMO_LINK_TABLE_V1: linkTableV1,

  PEER_ID_DIRECTORY: peerIdJsonDirectory,
  PEER_ID_FILE: peerIdJsonFile,
  PEER_ANNOUNCE_ADDR: peerAnnounceAddr,
  PIPELINING: rawPipelining,
  PORT: rawPort,
  HTTP_PORT: rawHttpPort,
  PING_PERIOD_SECONDS: pingPeriodSecs,

  DYNAMO_MAX_RETRIES: dynamoMaxRetries,
  DYNAMO_RETRY_DELAY: dynamoRetryDelay,
  S3_MAX_RETRIES: s3MaxRetries,
  S3_RETRY_DELAY: s3RetryDelay
} = process.env

const concurrency = parseInt(rawConcurrency)
const pipelining = parseInt(rawPipelining)
const port = parseInt(rawPort)
const httpPort = parseInt(rawHttpPort)

module.exports = {
  blocksTable: blocksTable ?? 'blocks',
  cacheBlocksInfo: cacheBlocksInfo === 'true',
  cacheBlocksInfoSize: cacheBlocksInfoSize ?? 1e3,

  cacheBlockData: cacheBlockData === 'true',
  cacheBlockDataSize: cacheBlockDataSize ? parseInt(cacheBlockDataSize) : 1e3,

  carsTable: carsTable ?? 'cars',
  blocksTableV1: blocksTableV1 ?? 'v1-blocks',
  carsTableV1: carsTableV1 ?? 'v1-cars',
  linkTableV1: linkTableV1 ?? 'v1-blocks-cars-position',

  blocksTablePrimaryKey: 'multihash',
  carsTablePrimaryKey: 'path',
  linkTableBlockKey: 'blockmultihash',
  linkTableCarKey: 'carpath',

  pingPeriodSecs: pingPeriodSecs ?? 10,
  concurrency: !isNaN(concurrency) && concurrency > 0 ? concurrency : 128,
  peerIdJsonFile,
  peerIdJsonPath: join(peerIdJsonDirectory ?? '/tmp', peerIdJsonFile ?? 'peerId.json'),
  peerAnnounceAddr,
  pipelining: !isNaN(pipelining) && pipelining > 0 ? pipelining : 16,
  port: !isNaN(port) && port > 0 ? port : 3000,
  httpPort: !isNaN(httpPort) && httpPort > 0 ? httpPort : 3001,
  dynamoMaxRetries: dynamoMaxRetries ?? 3,
  dynamoRetryDelay: dynamoRetryDelay ?? 100, // ms
  s3MaxRetries: s3MaxRetries ?? 3,
  s3RetryDelay: s3RetryDelay ?? 100 // ms
}
