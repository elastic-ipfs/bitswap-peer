'use strict'

const { BufferList } = require('bl')
const { readFileSync } = require('fs')
const { base58btc: base58 } = require('multiformats/bases/base58')
const { resolve } = require('path')
const { Piscina } = require('piscina')
const { Agent, request } = require('undici')
const { xml2js } = require('xml-js')
const sleep = require('util').promisify(setTimeout)

const { concurrency: connections, pipelining, s3MaxRetries, s3RetryDelay, dynamoRetryDelay, dynamoMaxRetries } = require('./config')
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

async function searchCarInDynamo(dispatcher, table, keyName, keyValue, retries = dynamoMaxRetries, retryDelay = dynamoRetryDelay) {
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

  let attempts = 1
  let error
  do {
    try {
      return await sendDynamoCommand(dispatcher, dynamoUrl, headers, payload)
    } catch (err) {
      logger.debug(`Cannot get item from DynamoDB - Table: ${table} Key: ${keyValue} Error: ${serializeError(err)}`)
      error = err
    }
    await sleep(retryDelay)
  } while (++attempts < retries)

  logger.error(`Cannot get item from Dynamo after ${attempts} attempts - Table: ${table} Key: ${keyValue} Error: ${serializeError(error)}`)
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

  const record = JSON.parse(buffer.slice())
  if (!record || !record.Item) {
    return undefined
  }

  const car = record.Item.cars.L[0].M
  return {
    offset: Number.parseInt(car.offset.N, 10),
    length: Number.parseInt(car.length.N, 10),
    car: car.car.S
  }
}

async function fetchBlockFromS3(dispatcher, bucketRegion, bucketName, key, offset, length, retries = s3MaxRetries, retryDelay = s3RetryDelay) {
  telemetry.increaseCount('s3-fetchs')
  if (length === 0) {
    logger.warn('Called fetch S3 with length 0')
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
        logger.error(`Not Found S3, URL: ${url}`)
        throw err
      }
      logger.error(`S3 Error, URL: ${url} Error: "${err.message}" attempt ${attempts} / ${retries}`)
    }

    await sleep(retryDelay)
  } while (++attempts < retries)

  logger.error(`Cannot download from S3 ${url} after ${attempts} attempts`)
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

module.exports = {
  cidToKey,
  defaultDispatcher,
  ensureAwsCredentials,
  fetchBlockFromS3,
  refreshAwsCredentials,
  searchCarInDynamo
}
