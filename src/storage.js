'use strict'

const { createHash, createHmac } = require('crypto')
const { BufferList } = require('bl')
const { readFileSync } = require('fs')
const { base58btc: base58 } = require('multiformats/bases/base58')
const { resolve } = require('path')
const { Pool, request } = require('undici')
const { xml2js } = require('xml-js')
const { concurrency, pipelining } = require('./config')
const { logger, serializeError } = require('./logging')
const telemetry = require('./telemetry')

// Setup AWS credentials handling
const unsignedPayload = 'UNSIGNED-PAYLOAD'
const region = process.env.AWS_REGION
let keyId = ''
let accessKey = ''
let sessionToken = ''

const dynamoClient = new Pool(`https://dynamodb.${region}.amazonaws.com/`, {
  keepAliveTimeout: 60000,
  connections: concurrency,
  pipelining: pipelining
})
const s3Client = new Pool(`https://s3.${region}.amazonaws.com/`, {
  keepAliveTimeout: 60000,
  connections: concurrency,
  pipelining: pipelining
})

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function hmacSha256(key, contents) {
  return createHmac('sha256', key).update(contents).digest()
}

function cidToKey(cid) {
  return base58.encode(cid.multihash.bytes)
}

function ensureAwsCredentials() {
  if (!process.env.AWS_ROLE_ARN || !process.env.AWS_WEB_IDENTITY_TOKEN_FILE) {
    keyId = process.env.AWS_ACCESS_KEY_ID
    accessKey = process.env.AWS_SECRET_ACCESS_KEY

    return Promise.resolve()
  }

  // Every 50 minutes we rotate the keys using STS
  setInterval(() => {
    refreshAwsCredentials(process.env.AWS_ROLE_ARN)
  }, 50 * 60_000).unref()

  return refreshAwsCredentials(process.env.AWS_ROLE_ARN)
}

async function refreshAwsCredentials(role) {
  const identityFile = readFileSync(resolve(process.cwd(), process.env.AWS_WEB_IDENTITY_TOKEN_FILE))
  const url = new URL('https://sts.amazonaws.com/')

  url.searchParams.append('Version', '2011-06-15')
  url.searchParams.append('Action', 'AssumeRoleWithWebIdentity')
  url.searchParams.append('RoleArn', role)
  url.searchParams.append('RoleSessionName', 'bitswap-peer')
  url.searchParams.append('WebIdentityToken', identityFile)

  const { statusCode, body } = await request(url)

  const buffer = new BufferList()

  for await (const chunk of body) {
    buffer.append(chunk)
  }

  if (statusCode >= 400) {
    throw new Error(
      `Cannot refresh AWS credentials: AssumeRoleWithWebIdentity failed with HTTP error ${statusCode} and body: ${buffer
        .slice()
        .toString('utf-8')} `
    )
  }

  const response = xml2js(buffer.slice().toString('utf-8'), { compact: true }).AssumeRoleWithWebIdentityResponse
  keyId = response.AssumeRoleWithWebIdentityResult.Credentials.AccessKeyId._text
  accessKey = response.AssumeRoleWithWebIdentityResult.Credentials.SecretAccessKey._text
  sessionToken = response.AssumeRoleWithWebIdentityResult.Credentials.SessionToken._text
}

// TODO@PI: Shall we add a LRU?
function getAWSSignedHeaders(service, method, rawUrl, additionalHeaders = {}, payload = null) {
  const url = new URL(rawUrl)

  // Compute the full set of headers to set
  const payloadHash = payload ? sha256(payload) : unsignedPayload
  const headers = {
    'x-amz-date': new Date()
      .toISOString()
      .replace(/\.\d{0,3}/, '')
      .replace(/[:-]/g, ''),
    host: url.host,
    ...additionalHeaders
  }

  if (sessionToken) {
    headers['x-amz-security-token'] = sessionToken
  }

  if (!payload) {
    headers['x-amz-content-sha256'] = unsignedPayload
  }

  // Create the CanonicalRequest
  const sortedHeaders = Object.entries(headers).sort((a, b) => a[0].localeCompare(b[0]))

  let canonicalRequest = `${method}\n${encodeURIComponent(url.pathname).replaceAll('%2F', '/')}\n`
  let signedHeaders = ''

  for (let i = 0; i < sortedHeaders.length; i++) {
    canonicalRequest += `\n${sortedHeaders[i][0]}:${sortedHeaders[i][1]}`
    signedHeaders += ';' + sortedHeaders[i][0]
  }

  signedHeaders = signedHeaders.slice(1)
  canonicalRequest += `\n\n${signedHeaders}\n${payloadHash}`

  // Create the StringToSign
  const date = headers['x-amz-date'].slice(0, 8)
  const stringToSign = `AWS4-HMAC-SHA256
${headers['x-amz-date']}
${date}/${region}/${service}/aws4_request
${sha256(canonicalRequest)}`

  // Calculate signature
  const dateKey = hmacSha256(`AWS4${accessKey}`, date)
  const dateRegionKey = hmacSha256(dateKey, region)
  const dateRegionServiceKey = hmacSha256(dateRegionKey, service)
  const signingKey = hmacSha256(dateRegionServiceKey, 'aws4_request')
  const signature = hmacSha256(signingKey, stringToSign).toString('hex')

  // Set the headers and return
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${keyId}/${date}/${region}/${service}/aws4_request,SignedHeaders=${signedHeaders},Signature=${signature}`
  return headers
}

async function searchCarInDynamo(table, keyName, keyValue) {
  const region = process.env.AWS_REGION

  try {
    telemetry.increaseCount('dynamo-reads')

    // Create the request and sign it
    const url = `https://dynamodb.${region}.amazonaws.com/`
    const payload = JSON.stringify({
      TableName: table,
      Key: { [keyName]: { S: keyValue } },
      ProjectionExpression: 'cars'
    })

    const headers = getAWSSignedHeaders(
      'dynamodb',
      'POST',
      url,
      { 'x-amz-target': 'DynamoDB_20120810.GetItem' },
      payload
    )

    // Download from S3
    const { statusCode, body } = await telemetry.trackDuration(
      'dynamo-reads',
      dynamoClient.request({
        method: 'POST',
        path: '/',
        headers: { ...headers, 'content-type': 'application/x-amz-json-1.0' },
        body: payload
      })
    )

    // Read the response
    const buffer = new BufferList()

    for await (const chunk of body) {
      buffer.append(chunk)
    }

    if (statusCode >= 400) {
      throw new Error(`GetItem failed with HTTP error ${statusCode} and body: ${buffer.slice().toString('utf-8')} `)
    }

    const record = JSON.parse(buffer.slice())
    const car = record.Item.cars.L[0].M

    return { offset: Number.parseInt(car.offset.N, 10), length: Number.parseInt(car.length.N, 10), car: car.car.S }
  } catch (e) {
    logger.error(`Cannot get item from DynamoDB table ${table}: ${serializeError(e)}`)
    throw e
  }
}

async function fetchBlockFromS3(bucket, key, offset, length) {
  const region = process.env.AWS_REGION

  try {
    telemetry.increaseCount('s3-fetchs')

    if (length === 0) {
      return Buffer.alloc(0)
    }

    // Create the request and sign it
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    const headers = getAWSSignedHeaders(
      's3',
      'GET',
      url,
      offset > 0 && length > 0 ? { range: `bytes=${offset}-${offset + length - 1}` } : {}
    )

    // Download from S3
    const { statusCode, body } = await telemetry.trackDuration(
      's3-fetchs',
      s3Client.request({ method: 'GET', path: `/${key}`, headers })
    )

    // Read the response
    const buffer = new BufferList()

    for await (const chunk of body) {
      buffer.append(chunk)
    }

    if (statusCode >= 400) {
      throw new Error(`Fetch failed with HTTP error ${statusCode} and body: ${buffer.slice().toString('utf-8')} `)
    }

    return buffer.slice()
  } catch (e) {
    logger.error(`Cannot download ${key} from S3 bucket ${bucket}: ${serializeError(e)}`)
    throw e
  }
}

module.exports = {
  cidToKey,
  searchCarInDynamo,
  fetchBlockFromS3,
  ensureAwsCredentials
}
