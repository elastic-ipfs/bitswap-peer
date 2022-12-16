
import { Agent as HttpsAgent } from 'https'
import LRUCache from 'mnemonist/lru-cache.js'
import config from './config.js'
import { logger } from './logging.js'
import { telemetry } from './telemetry.js'
import { TELEMETRY_TYPE_DATA, TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_CANCELED, TELEMETRY_RESULT_ERROR, TELEMETRY_RESULT_HITS, TELEMETRY_RESULT_MISSES } from './constants.js'

// TODO when the v0 tables will not be used anymore, following dependencies will be removed
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { NodeHttpHandler } from '@aws-sdk/node-http-handler'
import LRU from 'lru-cache'
// /TODO

const blockInfoCache = config.cacheBlockInfo ? new LRUCache(config.cacheBlockInfoSize) : null
const blockDataCache = config.cacheBlockData ? new LRUCache(config.cacheBlockDataSize) : null

async function searchCarInDynamoV1 ({
  awsClient,
  table = config.linkTableV1,
  keyName = config.linkTableBlockKey,
  carKeyName = config.linkTableCarKey,
  blockKey,
  logger,
  retries,
  retryDelay
}) {
  const blocks = await telemetry.trackDuration('dynamo-request-durations',
    awsClient.dynamoQueryBySortKey({ table, keyName, keyValue: blockKey, retries, retryDelay }))

  if (blocks.length > 0) {
    // current implementation support only 1 car per block, so the first one is picked
    const block = blocks[0]
    return {
      offset: block.offset,
      length: block.length,
      car: block[carKeyName]
    }
  }

  const fallback = await searchCarInDynamoV0({ awsClient, blockKey, retries, retryDelay })
  if (fallback) {
    logger.error({ block: { [keyName]: blockKey }, car: fallback.car }, 'block not found in V1 table but found in V0 table')
    if (process.env.NODE_ENV === 'production') {
      recoverV0Tables(fallback.car)
    }
    return fallback
  }
}

/**
 * this function will be removed after the migration will be completed
 */
async function searchCarInDynamoV0 ({
  awsClient,
  table = config.blocksTable,
  keyName = config.blocksTablePrimaryKey,
  blockKey,
  retries,
  retryDelay
}) {
  const block = await telemetry.trackDuration('dynamo-request-durations',
    awsClient.dynamoGetItem({ table, keyName, keyValue: blockKey, retries, retryDelay }))
  if (!block?.cars[0]) {
    return
  }

  const car = block.cars[0]
  return {
    offset: car.offset,
    length: car.length,
    car: car.car
  }
}

// ---

/**
 * content will be appended to each block
 */
async function fetchBlocksData ({ blocks, logger, awsClient }) {
  // load blocks info to get offset and length
  await fetchBlocksInfo({ blocks, logger, awsClient })

  await Promise.allSettled(blocks
    .map(block => fetchBlockData({ block, logger, awsClient })))
}

async function fetchBlockData ({ block, logger, awsClient }) {
  if (block.cancel) {
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_CANCELED])
    return
  }

  if (!block.key) {
    logger.error({ block }, 'invalid block, missing key')
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_ERROR])
    return
  }

  if (!block.info?.car) {
    block.data = { notFound: true }
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_MISSES])
    return
  }

  if (block.info.length > config.maxBlockDataSize) {
    logger.error({ block }, 'invalid block, length is greater than max allowed')
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_ERROR])
    // TODO should send error?
    block.data = { notFound: true }
    return
  }

  let cacheKey
  if (config.cacheBlockData) {
    cacheKey = block.key + '-' + block.info.offset + '-' + block.info.length
    const cached = blockDataCache.get(cacheKey)
    if (cached) {
      telemetry.increaseLabelCount('cache-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_HITS])
      telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_HITS])
      block.data = { content: cached, found: true }
      return
    }
    telemetry.increaseLabelCount('cache-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_MISSES])
  }

  try {
    const [, region, bucket, key] = block.info.car.match(/([^/]+)\/([^/]+)\/(.+)/)
    const content = await telemetry.trackDuration('s3-request-durations',
      awsClient.s3Fetch({ region, bucket, key, offset: block.info.offset, length: block.info.length }))
    block.data = { content, found: true }
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_HITS])
    config.cacheBlockData && blockDataCache.set(cacheKey, content)
    return
  } catch (error) {
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_ERROR])
  }

  block.data = { notFound: true }
  telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_DATA, TELEMETRY_RESULT_MISSES])
}

/**
 * info will be appended to each block
 */
async function fetchBlocksInfo ({ blocks, logger, awsClient }) {
  await Promise.allSettled(blocks
    .map(block => fetchBlockInfo({ block, logger, awsClient })))
}

async function fetchBlockInfo ({ block, logger, awsClient }) {
  if (block.cancel) {
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_CANCELED])
    return
  }

  if (!block.key) {
    logger.error({ block }, 'invalid block, missing key')
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_ERROR])
    return
  }

  if (config.cacheBlockInfo) {
    const cached = blockInfoCache.get(block.key)
    if (cached) {
      telemetry.increaseLabelCount('cache-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_HITS])
      telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_HITS])
      block.info = { ...cached, found: true }
      return
    }
    telemetry.increaseLabelCount('cache-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_MISSES])
  }

  try {
    const info = await searchCarInDynamoV1({ blockKey: block.key, logger, awsClient })
    if (info) {
      block.info = { ...info, found: true }
      telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_HITS])
      config.cacheBlockInfo && blockInfoCache.set(block.key, info)
      return
    }
  } catch (error) {
    telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_ERROR])
  }

  block.info = { notFound: true }
  telemetry.increaseLabelCount('bitswap-block', [TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_MISSES])
}

const recovering = new LRU({
  ttl: 12 * 60 * 60 * 1000, // 12 h in ms
  ttlResolution: 10e3, // ttl check rate 10 s
  max: 10e3 // max 10k entries in the recovering list
})
const sqsClient = new SQSClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: new HttpsAgent({ keepAlive: true, keepAliveMsecs: 60000 }) })
})

// --- temporary solution to lazy recover missing car files
// will send to the indexer queue the missing car file, using the list to avoid to send the same car multiple times
// TODO when the v0 tables will not be used anymore, following dependencies will be removed

async function recoverV0Tables (car, queue = 'indexer-topic') {
  try {
    if (recovering.has(car)) { return }
    logger.info({ car }, 'recovering car')

    await sqsClient.send(new SendMessageCommand({ QueueUrl: queue, MessageBody: car }))

    recovering.set(car, 1)
  } catch (err) {
    logger.error({ car, err }, 'unable to recover the car')
  }
}

export {
  fetchBlocksData,
  fetchBlocksInfo,
  fetchBlockData,
  fetchBlockInfo,

  blockInfoCache,
  blockDataCache,

  searchCarInDynamoV1,
  searchCarInDynamoV0
}
