'use strict'

const { BufferList } = require('bl')
const { readFileSync } = require('fs')
const { base58btc: base58 } = require('multiformats/bases/base58')
const { resolve } = require('path')
const { Piscina } = require('piscina')
const { Agent, request } = require('undici')
const { xml2js } = require('xml-js')
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb')
const sleep = require('util').promisify(setTimeout)

const {
  blocksTable,
  blocksTablePrimaryKey,

  linkTableV1,
  linkTableBlockKey,
  linkTableCarKey,

  concurrency: connections,
  pipelining,
  s3MaxRetries,
  s3RetryDelay,
  dynamoRetryDelay,
  dynamoMaxRetries
} = require('./config')
const { logger, serializeError } = require('./logging')
const { telemetry } = require('./telemetry')

// Setup AWS credentials handling
const dynamoRegion = process.env.AWS_REGION
const dynamoUrl = `https://dynamodb.${dynamoRegion}.amazonaws.com/`

let keyId = ''
let accessKey = ''
let sessionToken = ''

const defaultDispatcher = new Agent({ keepAliveTimeout: 60000, connections, pipelining })

const signerWorker = new Piscina({
  filename: resolve(process.cwd(), 'src/signer-worker.js'),
  idleTimeout: Math.pow(2, 31) - 1
})

function cidToKey(cid) {
  return base58.encode(cid.multihash.bytes)
}

function ensureAwsCredentials() {
  /* c8 ignore next 1 */
  if (!process.env.AWS_ROLE_ARN || !process.env.AWS_WEB_IDENTITY_TOKEN_FILE) {
    keyId = process.env.AWS_ACCESS_KEY_ID
    accessKey = process.env.AWS_SECRET_ACCESS_KEY

    return Promise.resolve()
  }
  /* c8 ignore next 7 */

  // Every 50 minutes we rotate the keys using STS
  setInterval(() => {
    refreshAwsCredentials(process.env.AWS_ROLE_ARN)
  }, 50 * 60_000).unref()

  return refreshAwsCredentials(process.env.AWS_ROLE_ARN)
}

async function refreshAwsCredentials(role, identity, dispatcher) {
  /* c8 ignore next 3 */
  if (!dispatcher) {
    dispatcher = defaultDispatcher
  }

  /* c8 ignore next 3 */
  if (!identity) {
    identity = readFileSync(resolve(process.cwd(), process.env.AWS_WEB_IDENTITY_TOKEN_FILE))
  }

  const url = new URL('https://sts.amazonaws.com/')

  url.searchParams.append('Version', '2011-06-15')
  url.searchParams.append('Action', 'AssumeRoleWithWebIdentity')
  url.searchParams.append('RoleArn', role)
  url.searchParams.append('RoleSessionName', 'bitswap-peer')
  url.searchParams.append('WebIdentityToken', identity)

  const { statusCode, body } = await request(url, { dispatcher })

  const buffer = new BufferList()

  for await (const chunk of body) {
    buffer.append(chunk)
  }

  if (statusCode >= 400) {
    throw new Error(
      `Cannot refresh AWS credentials: AssumeRoleWithWebIdentity failed with HTTP error ${statusCode} and body: ${buffer
        .slice()
        .toString('utf-8')}`
    )
  }

  const response = xml2js(buffer.slice().toString('utf-8'), { compact: true }).AssumeRoleWithWebIdentityResponse
  keyId = response.AssumeRoleWithWebIdentityResult.Credentials.AccessKeyId._text
  accessKey = response.AssumeRoleWithWebIdentityResult.Credentials.SecretAccessKey._text
  sessionToken = response.AssumeRoleWithWebIdentityResult.Credentials.SessionToken._text

  return { keyId, accessKey, sessionToken }
}

async function searchCarInDynamoV1({
  blockKey,
  dispatcher = defaultDispatcher,
  logger,
  retries = dynamoMaxRetries,
  retryDelay = dynamoRetryDelay
}) {
  const key = { name: linkTableBlockKey, value: blockKey }
  const cars = await dynamoQuery({ dispatcher, table: linkTableV1, key, logger, retries, retryDelay })

  if (cars.length > 0) {
    // current implementation support only 1 car per block, so the first one is picked
    const car = cars[0]
    return {
      offset: car.offset,
      length: car.length,
      car: car[linkTableCarKey]
    }
  }

  const fallback = await searchCarInDynamoV0(dispatcher, blocksTable, blocksTablePrimaryKey, blockKey, retries, retryDelay)
  if (fallback) {
    logger.error({ block: key, car: fallback.car }, 'block not found in V1 table but found in V0 table')
    if (process.env.NODE_ENV === 'production') {
      recoverV0Tables(fallback.car)
    }
    return fallback
  }
}

async function dynamoQuery({
  dispatcher,
  table,
  key,
  logger,
  region = dynamoRegion,
  url = dynamoUrl,
  retries = dynamoMaxRetries,
  retryDelay = dynamoRetryDelay
}) {
  telemetry.increaseCount('dynamo-reads')

  const payload = JSON.stringify({
    TableName: table,
    Limit: 1,
    KeyConditionExpression: `${key.name} = :v`,
    ExpressionAttributeValues: marshall({ ':v': key.value }, { removeUndefined: true })
  })

  const headers = await signerWorker.run({
    region,
    keyId,
    accessKey,
    sessionToken,
    service: 'dynamodb',
    method: 'POST',
    url,
    headers: { 'x-amz-target': 'DynamoDB_20120810.Query' },
    payload
  })

  let attempts = 0
  let err
  let record
  do {
    try {
      record = await sendDynamoCommand(dispatcher, url, headers, payload)
      break
    } catch (error) {
      logger.debug(
        { error: serializeError(error), table, key },
        `Cannot query DynamoDB attempt ${attempts + 1} / ${retries}`
      )
      err = error
    }
    await sleep(retryDelay)
  } while (++attempts < retries)

  if (record) {
    return record?.Items ? record.Items.map(i => unmarshall(i)) : []
  }

  logger.error({ error: serializeError(err), table, key }, `Cannot query Dynamo after ${attempts} attempts`)
  throw new Error('Cannot query Dynamo')
}

/**
 * this function will be removed after the migration will be completed
 */
async function searchCarInDynamoV0(
  dispatcher,
  table,
  keyName,
  keyValue,
  retries = dynamoMaxRetries,
  retryDelay = dynamoRetryDelay
) {
  telemetry.increaseCount('dynamo-reads')

  const payload = JSON.stringify({
    TableName: table,
    Key: { [keyName]: { S: keyValue } },
    ProjectionExpression: 'cars'
  })

  const headers = await signerWorker.run({
    region: dynamoRegion,
    keyId,
    accessKey,
    sessionToken,
    service: 'dynamodb',
    method: 'POST',
    url: dynamoUrl,
    headers: { 'x-amz-target': 'DynamoDB_20120810.GetItem' },
    payload
  })

  let attempts = 0
  let err
  do {
    try {
      const record = await sendDynamoCommand(dispatcher, dynamoUrl, headers, payload)
      if (!record?.Item) {
        return
      }

      const car = record.Item.cars.L[0].M
      return {
        offset: Number.parseInt(car.offset.N, 10),
        length: Number.parseInt(car.length.N, 10),
        car: car.car.S
      }
    } catch (error) {
      logger.debug(
        { table },
        `Cannot get item from DynamoDB attempt ${attempts + 1
        } / ${retries} - Table: ${table} Key: ${keyValue} Error: ${serializeError(error)}`
      )
      err = error
    }
    await sleep(retryDelay)
  } while (++attempts < retries)

  logger.error(
    { err },
    `Cannot get item from Dynamo after ${attempts} attempts - Table: ${table} Key: ${keyValue} Error: ${serializeError(
      err
    )}`
  )
  throw new Error(`Cannot get item from Dynamo Table: ${table} Key: ${keyValue}`)
}

async function sendDynamoCommand(dispatcher, url, headers, payload) {
  const { statusCode, body } = await telemetry.trackDuration(
    'dynamo-reads',
    request(url, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/x-amz-json-1.0' },
      body: payload,
      dispatcher
    })
  )

  const buffer = new BufferList()
  for await (const chunk of body) {
    buffer.append(chunk)
  }

  if (statusCode >= 400) {
    throw new Error(`DynamoDB.GetItem - Status: ${statusCode} Body: ${buffer.slice().toString('utf-8')} `)
  }

  return JSON.parse(buffer.slice())
}

async function fetchBlockFromS3(
  dispatcher,
  bucketRegion,
  bucketName,
  key,
  offset,
  length,
  retries = s3MaxRetries,
  retryDelay = s3RetryDelay
) {
  telemetry.increaseCount('s3-fetchs')
  if (length === 0) {
    logger.warn({ key }, 'Called fetch S3 with length 0')
    return Buffer.alloc(0)
  }

  // Create the request and sign it
  const url = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${key}`
  const headers = await signerWorker.run({
    region: bucketRegion,
    keyId,
    accessKey,
    sessionToken,
    service: 's3',
    method: 'GET',
    url,
    headers: offset > 0 && length > 0 ? { range: `bytes=${offset}-${offset + length - 1}` } : {}
  })

  let attempts = 1
  do {
    try {
      return await fetchFromS3(dispatcher, url, headers)
    } catch (err) {
      if (err.message === 'NOT_FOUND') {
        logger.error({ url }, 'Not Found S3')
        throw err
      }
      logger.debug(`S3 Error, URL: ${url} Error: "${err.message}" attempt ${attempts} / ${retries}`)
    }

    await sleep(retryDelay)
  } while (++attempts < retries)

  logger.error({ key }, `Cannot download from S3 ${url} after ${attempts} attempts`)
  throw new Error(`Cannot download from S3 ${url}`)
}

async function fetchFromS3(dispatcher, url, headers) {
  const { statusCode, body } = await telemetry.trackDuration(
    's3-fetchs',
    request(url, { method: 'GET', headers, dispatcher })
  )

  const buffer = new BufferList()
  for await (const chunk of body) {
    buffer.append(chunk)
  }

  if (statusCode === 404) {
    throw new Error('NOT_FOUND')
  }
  if (statusCode >= 400) {
    throw new Error(`S3 Response - Status: ${statusCode} Body: ${buffer.slice().toString('utf-8')} `)
  }

  return buffer.slice()
}

// --- temporary solution to lazy recover missing car files
// will send to the indexer queue the missing car file, using the list to avoid to send the same car multiple times
// TODO when the v0 tables will not be used anymore, following dependencies will be removed

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler')
const LRU = require('lru-cache')

const recovering = new LRU({
  ttl: 12 * 60 * 60 * 1000, // 12 h in ms
  ttlResolution: 10e3, // ttl check rate 10 s
  max: 10e3 // max 10k entries in the recovering list
})
const sqsClient = new SQSClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: new Agent({ keepAlive: true, keepAliveMsecs: 60000 }) })
})

async function recoverV0Tables(car, queue = 'indexer-topic') {
  try {
    if (recovering.has(car)) { return }
    logger.info({ car }, 'recovering car')

    await sqsClient.send(new SendMessageCommand({ QueueUrl: queue, MessageBody: `{"body":"${car}",skipExists:true}` }))

    recovering.set(car, 1)
  } catch (error) {
    logger.error({ car, error: serializeError(error) }, 'unable recover the car')
  }
}

module.exports = {
  cidToKey,
  defaultDispatcher,
  ensureAwsCredentials,
  fetchBlockFromS3,
  refreshAwsCredentials,
  searchCarInDynamoV0,
  searchCarInDynamoV1
}
