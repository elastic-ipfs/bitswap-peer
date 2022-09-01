'use strict'

/* c8 ignore file */

const { join, resolve } = require('path')

require('dotenv').config({ path: process.env.ENV_FILE_PATH || resolve(process.cwd(), '.env') })

const {
  MAX_BLOCK_DATA_SIZE: maxBlockDataSize,
  MAX_MESSAGE_SIZE: maxMessageSize,

  PROCESSING_QUEUE_CONCURRENCY: processingQueueConcurrency,
  BLOCKS_BATCH_SIZE: blocksBatchSize,

  CACHE_BLOCK_INFO: cacheBlockInfo,
  CACHE_BLOCK_INFO_SIZE: cacheBlockInfoSize,

  CACHE_BLOCK_DATA: cacheBlockData,
  CACHE_BLOCK_DATA_SIZE: cacheBlockDataSize,

  DYNAMO_BLOCKS_TABLE: blocksTable,
  DYNAMO_CARS_TABLE: carsTable,
  DYNAMO_BLOCKS_TABLE_V1: blocksTableV1,
  DYNAMO_CARS_TABLE_V1: carsTableV1,
  DYNAMO_LINK_TABLE_V1: linkTableV1,

  PEER_ID_DIRECTORY: peerIdJsonDirectory,
  PEER_ID_FILE: peerIdJsonFile,
  PEER_ANNOUNCE_ADDR: peerAnnounceAddr,
  PORT: rawPort,
  HTTP_PORT: rawHttpPort,

  ENABLE_KEEP_ALIVE: enableKeepAlive,
  PING_PERIOD_SECONDS: pingPeriodSecs,

  DYNAMO_MAX_RETRIES: dynamoMaxRetries,
  DYNAMO_RETRY_DELAY: dynamoRetryDelay,
  S3_MAX_RETRIES: s3MaxRetries,
  S3_RETRY_DELAY: s3RetryDelay
} = process.env

const port = parseInt(rawPort)
const httpPort = parseInt(rawHttpPort)

module.exports = {
  maxBlockDataSize: maxBlockDataSize ? parseInt(maxBlockDataSize) : 2 * 1024 * 1024, // 2 MB
  maxMessageSize: maxMessageSize ? parseInt(maxMessageSize) : 4 * 1024 * 1024, // 4 MB
  processingQueueConcurrency: processingQueueConcurrency ? parseInt(processingQueueConcurrency) : 32,
  blocksBatchSize: blocksBatchSize ? parseInt(blocksBatchSize) : 32,

  blocksTable: blocksTable ?? 'blocks',

  cacheBlockInfo: cacheBlockInfo ? cacheBlockInfo === 'true' : true, // default is true
  cacheBlockInfoSize: cacheBlockInfoSize ? parseInt(cacheBlockInfoSize) : 1e4,

  cacheBlockData: cacheBlockData === 'true', // default is false
  cacheBlockDataSize: cacheBlockDataSize ? parseInt(cacheBlockDataSize) : 1e3,

  carsTable: carsTable ?? 'cars',
  blocksTableV1: blocksTableV1 ?? 'v1-blocks',
  carsTableV1: carsTableV1 ?? 'v1-cars',
  linkTableV1: linkTableV1 ?? 'v1-blocks-cars-position',

  blocksTablePrimaryKey: 'multihash',
  carsTablePrimaryKey: 'path',
  linkTableBlockKey: 'blockmultihash',
  linkTableCarKey: 'carpath',

  enableKeepAlive: enableKeepAlive ?? 'true',
  pingPeriodSecs: pingPeriodSecs ?? 10,

  peerIdJsonFile,
  peerIdJsonPath: join(peerIdJsonDirectory ?? '/tmp', peerIdJsonFile ?? 'peerId.json'),
  peerAnnounceAddr,
  port: !isNaN(port) && port > 0 ? port : 3000,
  httpPort: !isNaN(httpPort) && httpPort > 0 ? httpPort : 3001,
  dynamoMaxRetries: dynamoMaxRetries ?? 3,
  dynamoRetryDelay: dynamoRetryDelay ?? 100, // ms
  s3MaxRetries: s3MaxRetries ?? 3,
  s3RetryDelay: s3RetryDelay ?? 100 // ms
}
