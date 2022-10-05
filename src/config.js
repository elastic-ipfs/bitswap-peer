'use strict'

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

  AWS_CLIENT_REFRESH_CREDENTIALS_INTERVAL: awsClientRefreshCredentialsInterval,
  AWS_CLIENT_CONCURRENCY: awsClientConcurrency,
  AWS_CLIENT_PIPELINING: awsClientPipelining,
  AWS_CLIENT_KEEP_ALIVE_TIMEOUT: awsClientKeepAliveTimeout,
  AWS_CLIENT_CONNECT_TIMEOUT: awsClientConnectTimeout,
  AWS_ROLE_SESSION_NAME: awsRoleSessionName,

  DYNAMO_REGION: dynamoRegion,
  DYNAMO_BLOCKS_TABLE: blocksTable,
  DYNAMO_CARS_TABLE: carsTable,
  DYNAMO_BLOCKS_TABLE_V1: blocksTableV1,
  DYNAMO_CARS_TABLE_V1: carsTableV1,
  DYNAMO_LINK_TABLE_V1: linkTableV1,

  PEER_ID_DIRECTORY: peerIdJsonDirectory,
  PEER_ID_FILE: peerIdJsonFile,
  PEER_ID_S3_REGION: peerIdS3Region,
  PEER_ID_S3_BUCKET: peerIdS3Bucket,
  PEER_ANNOUNCE_ADDR: peerAnnounceAddr,
  PORT: rawPort,
  HTTP_PORT: rawHttpPort,

  // TODO drop keep alive feature
  ENABLE_KEEP_ALIVE: enableKeepAlive,
  PING_PERIOD_SECONDS: pingPeriodSecs,

  DYNAMO_MAX_RETRIES: dynamoMaxRetries,
  DYNAMO_RETRY_DELAY: dynamoRetryDelay,
  S3_MAX_RETRIES: s3MaxRetries,
  S3_RETRY_DELAY: s3RetryDelay,

  ALLOW_INSPECTION: allowInspection
} = process.env

const port = parseInt(rawPort)
const httpPort = parseInt(rawHttpPort)

module.exports = {
  maxBlockDataSize: maxBlockDataSize ? parseInt(maxBlockDataSize) : 2 * 1024 * 1024, // 2 MB
  maxMessageSize: maxMessageSize ? parseInt(maxMessageSize) : 4 * 1024 * 1024, // 4 MB
  processingQueueConcurrency: processingQueueConcurrency ? parseInt(processingQueueConcurrency) : 256,
  blocksBatchSize: blocksBatchSize ? parseInt(blocksBatchSize) : 8,

  blocksTable: blocksTable ?? 'blocks',
  cacheBlockInfo: cacheBlockInfo === 'true',
  cacheBlockInfoSize: cacheBlockInfoSize ? parseInt(cacheBlockInfoSize) : 1e3,

  cacheBlockData: cacheBlockData === 'true',
  cacheBlockDataSize: cacheBlockDataSize ? parseInt(cacheBlockDataSize) : 1e3,

  dynamoRegion: dynamoRegion ?? process.env.AWS_REGION,
  carsTable: carsTable ?? 'cars',
  blocksTableV1: blocksTableV1 ?? 'v1-blocks',
  carsTableV1: carsTableV1 ?? 'v1-cars',
  linkTableV1: linkTableV1 ?? 'v1-blocks-cars-position',

  blocksTablePrimaryKey: 'multihash',
  carsTablePrimaryKey: 'path',
  linkTableBlockKey: 'blockmultihash',
  linkTableCarKey: 'carpath',

  enableKeepAlive: enableKeepAlive ?? false,
  pingPeriodSecs: pingPeriodSecs ?? 10,

  awsClientRefreshCredentialsInterval: awsClientRefreshCredentialsInterval ?? 50 * 60e3, // 50 min
  awsClientKeepAliveTimeout: awsClientKeepAliveTimeout ? parseInt(awsClientKeepAliveTimeout) : 60e3, // 1min
  awsClientConnectTimeout: awsClientConnectTimeout ? parseInt(awsClientConnectTimeout) : 120e3, // 2min
  awsClientConcurrency: awsClientConcurrency ? parseInt(awsClientConcurrency) : 128,
  awsClientPipelining: awsClientPipelining ? parseInt(awsClientPipelining) : 8,
  awsRoleSessionName: awsRoleSessionName ?? 'bitswap-peer',

  peerIdJsonFile,
  peerIdJsonPath: join(peerIdJsonDirectory ?? '/tmp', peerIdJsonFile ?? 'peerId.json'),
  peerIdS3Bucket,
  peerIdS3Region: peerIdS3Region ?? process.env.AWS_REGION,

  peerAnnounceAddr,
  port: !isNaN(port) && port > 0 ? port : 3000,
  httpPort: !isNaN(httpPort) && httpPort > 0 ? httpPort : 3001,
  dynamoMaxRetries: dynamoMaxRetries ? parseInt(dynamoMaxRetries) : 3,
  dynamoRetryDelay: dynamoRetryDelay ? parseInt(dynamoRetryDelay) : 100, // ms
  s3MaxRetries: s3MaxRetries ? parseInt(s3MaxRetries) : 3,
  s3RetryDelay: s3RetryDelay ? parseInt(s3RetryDelay) : 100, // ms

  allowInspection: allowInspection === 'true'
}
