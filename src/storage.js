'use strict'

const { Agent } = require('https')
const { DynamoDBClient, GetItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler')
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb')
const { base58btc: base58 } = require('multiformats/bases/base58')
const sleep = require('util').promisify(setTimeout)

const {
  blocksTable, blocksTablePrimaryKey,
  linkTableV1, linkTableBlockKey, linkTableCarKey,
  s3MaxRetries, s3RetryDelay, dynamoRetryDelay, dynamoMaxRetries
} = require('./config')
const { serializeError } = require('./logging')
const { telemetry } = require('./telemetry')

const HTTP_AGENT_OPTIONS = { keepAlive: true, keepAliveMsecs: 60e3, maxSockets: Infinity }

const defaultAwsRegion = process.env.AWS_REGION
const dynamoClient = new DynamoDBClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: new Agent(HTTP_AGENT_OPTIONS) })
})
const s3Clients = {}
s3Clients[defaultAwsRegion] = new S3Client({
  region: defaultAwsRegion,
  requestHandler: new NodeHttpHandler({ httpsAgent: new Agent(HTTP_AGENT_OPTIONS) })
})

function cidToKey(cid) {
  return base58.encode(cid.multihash.bytes)
}

async function fetchS3({ region, bucket, key, offset, length, logger, retries = s3MaxRetries, retryDelay = s3RetryDelay }) {
  if (length === 0) {
    logger.warn({ key }, 'Called fetch S3 with length 0')
    return Buffer.alloc(0)
  }
  let s3Client = s3Clients[region]
  if (!s3Client) {
    s3Clients[region] = new S3Client({
      region,
      requestHandler: new NodeHttpHandler({ httpsAgent: new Agent(HTTP_AGENT_OPTIONS) })
    })
    s3Client = s3Clients[region]
  }
  telemetry.increaseCount('s3-fetchs')

  let attempts = 0
  let error
  let response
  const request = { Bucket: bucket, Key: key }
  if (length > 0) {
    if (!offset) { offset = 0 }
    request.Range = 'bytes=' + offset + '-' + (length - 1)
  }

  do {
    error = null
    try {
      response = await telemetry.trackDuration('s3-request',
        s3Client.send(new GetObjectCommand(request)))
      break
    } catch (err) {
      if (err.code === 'NoSuchKey') {
        // not found
        logger.error({ error: serializeError(err), region, bucket, key }, 'S3 does not exists')
        error = err
        break
      }
      logger.debug({ region, bucket, key }, `S3 Error Error: "${err.message}" attempt ${attempts + 1} / ${retries}`)
      error = err
    }
    await sleep(retryDelay)
  } while (++attempts < retries)

  if (error) {
    if (attempts === retries) {
      logger.error({ error: serializeError(error), region, bucket, key }, `Cannot open file S3 after ${attempts} attempts`)
    }
    throw error
  }

  return streamToBuffer(response.Body)
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

async function searchCarInDynamoV1({
  blockKey,
  logger,
  retries = dynamoMaxRetries,
  retryDelay = dynamoRetryDelay
}) {
  telemetry.increaseCount('dynamo-reads')

  const key = { name: linkTableBlockKey, value: blockKey }
  const record = await telemetry.trackDuration(
    'dynamo-request',
    sendDynamoCommand({
      command: new QueryCommand({
        TableName: linkTableV1,
        Limit: 1,
        KeyConditionExpression: `${key.name} = :v`,
        ExpressionAttributeValues: marshall({ ':v': key.value }, { removeUndefined: true })
      }),
      logger,
      retries,
      retryDelay
    })
  )

  if (record?.Items?.length > 0) {
    const cars = record.Items.map(i => unmarshall(i))
    // current implementation supports only 1 car per block, so the first one is picked
    const car = cars[0]
    return {
      offset: car.offset,
      length: car.length,
      car: car[linkTableCarKey]
    }
  }

  const fallback = await searchCarInDynamoV0({ blockKey, logger, retries, retryDelay })
  if (fallback) {
    logger.error({ block: key, car: fallback.car }, 'block not found in V1 table but found in V0 table')
    if (process.env.NODE_ENV === 'production') {
      recoverV0Tables(fallback.car, logger)
    }
    return fallback
  }
}

/**
 * this function will be removed after the migration will be completed
 */
async function searchCarInDynamoV0({
  blockKey,
  logger,
  retries = dynamoMaxRetries,
  retryDelay = dynamoRetryDelay
}) {
  telemetry.increaseCount('dynamo-reads')

  const record = await telemetry.trackDuration(
    'dynamo-request',
    sendDynamoCommand({
      command: new GetItemCommand({
        TableName: blocksTable,
        Key: { [blocksTablePrimaryKey]: { S: blockKey } },
        ProjectionExpression: 'cars'
      }),
      logger,
      retries,
      retryDelay
    })
  )

  if (!record?.Item) {
    return
  }

  const car = record.Item.cars.L[0].M
  return {
    offset: Number.parseInt(car.offset.N, 10),
    length: Number.parseInt(car.length.N, 10),
    car: car.car.S
  }
}

async function sendDynamoCommand({
  client = dynamoClient,
  command,
  logger,
  retries = dynamoMaxRetries,
  retryDelay = dynamoRetryDelay
}) {
  telemetry.increaseCount('dynamo-reads')
  let attempts = 0
  let error

  do {
    try {
      return await client.send(command)
    } catch (err) {
      error = err
      logger.debug({ error: serializeError(err) }, `DynamoDB Error, attempt ${attempts + 1} / ${retries}`)
    }
    await sleep(retryDelay)
  } while (++attempts < retries)

  logger.error({ error: serializeError(error) }, `Cannot send command to DynamoDB after ${attempts} attempts`)
  throw new Error('Cannot send command to DynamoDB')
}

// --- temporary solution to lazy recover missing car files
// will send to the indexer queue the missing car file, using the list to avoid to send the same car multiple times
// TODO when the v0 tables will not be used anymore, following dependencies will be removed

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')
const LRU = require('lru-cache')

const recovering = new LRU({
  ttl: 6 * 60 * 60 * 1000, // 6 h in ms
  ttlResolution: 10e3, // ttl check rate 10 s
  max: 100 // max 10k entries in the recovering list
})
const sqsClient = new SQSClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: new Agent(HTTP_AGENT_OPTIONS) })
})

async function recoverV0Tables(car, logger, queue = 'indexer-topic') {
  try {
    if (recovering.has(car)) { return }
    logger.info({ car }, 'recovering car')

    await sqsClient.send(new SendMessageCommand({ QueueUrl: queue, MessageBody: car }))

    recovering.set(car, 1)
  } catch (error) {
    logger.error({ car, error: serializeError(error) }, 'unable to recover the car')
  }
}

module.exports = {
  cidToKey,
  fetchS3,
  searchCarInDynamoV1,
  searchCarInDynamoV0
}
