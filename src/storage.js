'use strict'

const { base58btc: base58 } = require('multiformats/bases/base58')

const {
  blocksTable,
  blocksTablePrimaryKey,

  linkTableV1,
  linkTableBlockKey,
  linkTableCarKey
} = require('./config')
const { logger, serializeError } = require('./logging')

function cidToKey(cid) {
  return base58.encode(cid.multihash.bytes)
}

function fetchBlockData({ awsClient, region, bucket, key, offset, length }) {
  return awsClient.s3Fetch({ region, bucket, key, offset, length })
}

async function searchCarInDynamoV1({
  awsClient,
  table = linkTableV1,
  keyName = linkTableBlockKey,
  carKeyName = linkTableCarKey,
  blockKey,
  logger,
  retries,
  retryDelay
}) {
  const blocks = await awsClient.dynamoQueryBySortKey({ table, keyName, keyValue: blockKey, retries, retryDelay })

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
async function searchCarInDynamoV0({
  awsClient,
  table = blocksTable,
  keyName = blocksTablePrimaryKey,
  blockKey,
  retries,
  retryDelay
}) {
  const block = await awsClient.dynamoGetItem({ table, keyName, keyValue: blockKey, retries, retryDelay })
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

// --- temporary solution to lazy recover missing car files
// will send to the indexer queue the missing car file, using the list to avoid to send the same car multiple times
// TODO when the v0 tables will not be used anymore, following dependencies will be removed

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler')
const LRU = require('lru-cache')
const { Agent: HttpsAgent } = require('https')

const recovering = new LRU({
  ttl: 12 * 60 * 60 * 1000, // 12 h in ms
  ttlResolution: 10e3, // ttl check rate 10 s
  max: 10e3 // max 10k entries in the recovering list
})
const sqsClient = new SQSClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: new HttpsAgent({ keepAlive: true, keepAliveMsecs: 60000 }) })
})

async function recoverV0Tables(car, queue = 'indexer-topic') {
  try {
    if (recovering.has(car)) { return }
    logger.info({ car }, 'recovering car')

    await sqsClient.send(new SendMessageCommand({ QueueUrl: queue, MessageBody: car }))

    recovering.set(car, 1)
  } catch (error) {
    logger.error({ car, err: serializeError(error) }, 'unable to recover the car')
  }
}

module.exports = {
  cidToKey,
  fetchBlockData,
  searchCarInDynamoV1,
  searchCarInDynamoV0
}
