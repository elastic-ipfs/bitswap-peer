'use strict'

const path = require('path')
const fs = require('fs/promises')
const { Piscina } = require('piscina')
const { Agent, request } = require('undici')
const { xml2js } = require('xml-js')
const { BufferList } = require('bl')
const { unmarshall } = require('@aws-sdk/util-dynamodb')
const { serializeError } = require('../logging')
const sleep = require('util').promisify(setTimeout)

const signerWorker = new Piscina({
  filename: path.resolve(__dirname, './signer-worker.js'),
  idleTimeout: Math.pow(2, 31) - 1
})

/**
 * s3 requests are multi region
 * dynamo requests point to a single region, defined in `dynamoOptions.region`
 * @see https://docs.aws.amazon.com/index.html
 */
class Client {
  constructor({ agent, agentOptions, s3Options, dynamoOptions, refreshCredentialsInterval, roleArn = process.env.AWS_ROLE_ARN, identityToken, roleSessionName, logger }) {
    // TODO validate params

    if (!dynamoOptions?.region) {
      throw new Error('missing dynamo region')
    }

    this.agent = agent
    this.agentOptions = agentOptions
    this.s3Options = s3Options
    this.dynamoOptions = dynamoOptions
    this.dynamoUrl = `https://dynamodb.${dynamoOptions.region}.amazonaws.com`

    this.refreshCredentialsInterval = refreshCredentialsInterval
    this.credentialRefreshTimer = null
    this.roleArn = roleArn
    this.identityToken = identityToken
    this.roleSessionName = roleSessionName

    this.logger = logger

    this.credentials = {
      keyId: '',
      accessKey: '',
      sessionToken: ''
    }
  }

  async init() {
    // custom agent is set for testing purpose only
    if (this.agent) {
      return
    }

    this.agent = new Agent(this.agentOptions)

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.credentials.keyId = process.env.AWS_ACCESS_KEY_ID
      this.credentials.accessKey = process.env.AWS_SECRET_ACCESS_KEY

      return
    }

    if (!this.identityToken && process.env.AWS_WEB_IDENTITY_TOKEN_FILE) {
      this.identityToken = await fs.readFile(path.resolve(process.cwd(), process.env.AWS_WEB_IDENTITY_TOKEN_FILE), 'utf8')
    }

    if (!this.refreshCredentialsInterval) {
      return
    }

    // Every N minutes we rotate the keys using STS
    this.credentialRefreshTimer = setInterval(() => {
      this.refreshCredentials()
    }, this.refreshCredentialsInterval).unref()

    return this.refreshCredentials()
  }

  close() {
    this.credentialRefreshTimer && clearInterval(this.credentialRefreshTimer)
  }

  async refreshCredentials() {
    const url = new URL('https://sts.amazonaws.com')

    url.searchParams.append('Version', '2011-06-15')
    url.searchParams.append('Action', 'AssumeRoleWithWebIdentity')
    this.roleArn && url.searchParams.append('RoleArn', this.roleArn)
    this.roleSessionName && url.searchParams.append('RoleSessionName', this.roleSessionName)
    this.identityToken && url.searchParams.append('WebIdentityToken', this.identityToken)

    const { statusCode, body } = await request(url, { dispatcher: this.agent })

    const buffer = new BufferList()
    for await (const chunk of body) {
      buffer.append(chunk)
    }
    const bodyString = buffer.slice().toString('utf-8')

    if (statusCode >= 400) {
      this.logger.fatal(`Cannot refresh AWS credentials: AssumeRoleWithWebIdentity failed with HTTP error ${statusCode} and body: ${bodyString}`)
      throw new Error(
        `Cannot refresh AWS credentials: AssumeRoleWithWebIdentity failed with HTTP error ${statusCode} and body: ${bodyString}`
      )
    }

    const response = xml2js(bodyString, { compact: true }).AssumeRoleWithWebIdentityResponse
    this.credentials.keyId = response.AssumeRoleWithWebIdentityResult.Credentials.AccessKeyId._text
    this.credentials.accessKey = response.AssumeRoleWithWebIdentityResult.Credentials.SecretAccessKey._text
    this.credentials.sessionToken = response.AssumeRoleWithWebIdentityResult.Credentials.SessionToken._text
  }

  s3Url(region, bucket, key = '') {
    return 'https://' + bucket + '.s3.' + region + '.amazonaws.com' + key
  }

  async s3Fetch({ region, bucket, key, offset, length, retries, retryDelay }) {
    if (length !== undefined && length < 1) {
      this.logger.warn({ key }, 'Called s3Fetch with length 0')
      return Buffer.alloc(0)
    }
    if (!retries) { retries = this.s3Options.maxRetries }
    if (!retryDelay) { retryDelay = this.s3Options.retryDelay }

    const url = this.s3Url(region, bucket, '/' + key)
    const plainHeaders = {
      url,
      region,
      keyId: this.credentials.keyId,
      accessKey: this.credentials.accessKey,
      sessionToken: this.credentials.sessionToken,
      service: 's3',
      method: 'GET'
    }
    if (length > 0) {
      if (!offset) { offset = 0 }
      plainHeaders.headers = { range: `bytes=${offset}-${offset + length - 1}` }
    }
    const headers = await signerWorker.run(plainHeaders)

    let attempts = 0
    do {
      try {
        return await this.s3Request({ url, headers })
      } catch (err) {
        if (err.message === 'NOT_FOUND') {
          this.logger.error({ url }, 'S3 Not Found')
          throw err
        }
        this.logger.debug(`S3 Error, URL: ${url} Error: "${err.message}" attempt ${attempts + 1} / ${retries}`)
      }

      await sleep(retryDelay)
    } while (++attempts < retries)

    this.logger.error({ key }, `Cannot S3.fetch ${url} after ${attempts} attempts`)
    throw new Error(`Cannot S3.fetch ${url}`)
  }

  /**
   * @see https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html
   */
  async s3HeadBucket({ region, bucket }) {
    const url = this.s3Url(region, bucket)
    const plainHeaders = {
      url,
      region,
      keyId: this.credentials.keyId,
      accessKey: this.credentials.accessKey,
      sessionToken: this.credentials.sessionToken,
      service: 's3',
      method: 'GET'
    }
    const headers = await signerWorker.run(plainHeaders)

    try {
      await this.s3Request({ url, headers })
      return true
    } catch (error) {
      this.logger.error({ err: serializeError(error), bucket }, 'Cannot s3.headBucket')
      throw new Error('s3.headBucket')
    }
  }

  async s3Request({ url, headers }) {
    const { statusCode, body } = await request(url, {
      method: 'GET',
      headers,
      dispatcher: this.agent
    })

    const buffer = new BufferList()
    for await (const chunk of body) {
      buffer.append(chunk)
    }

    if (statusCode === 404) {
      throw new Error('NOT_FOUND')
    }
    if (statusCode >= 400) {
      throw new Error(`S3 request error - Status: ${statusCode} Body: ${buffer.slice().toString('utf-8')} `)
    }

    return buffer.slice()
  }

  /**
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html
   */
  async dynamoQueryBySortKey({ table, keyName, keyValue, retries, retryDelay }) {
    if (!retries) { retries = this.dynamoOptions.maxRetries }
    if (!retryDelay) { retryDelay = this.dynamoOptions.retryDelay }

    const payload = JSON.stringify({
      TableName: table,
      Limit: 1,
      KeyConditionExpression: `${keyName} = :v`,
      ExpressionAttributeValues: { ':v': { S: keyValue } }
    })

    const headers = await signerWorker.run({
      url: this.dynamoUrl,
      region: this.dynamoOptions.region,
      keyId: this.credentials.keyId,
      accessKey: this.credentials.accessKey,
      sessionToken: this.credentials.sessionToken,
      service: 'dynamodb',
      method: 'POST',
      headers: { 'x-amz-target': 'DynamoDB_20120810.Query' },
      payload
    })

    let attempts = 0
    let err
    let record
    do {
      try {
        record = await this.dynamoRequest({ url: this.dynamoUrl, headers, payload })
        break
      } catch (error) {
        this.logger.debug(
          { err: serializeError(error), table, key: { [keyName]: keyValue } },
          `Cannot Dynamo.Query attempt ${attempts + 1} / ${retries}`
        )
        err = error
      }
      await sleep(retryDelay)
    } while (++attempts < retries)

    if (record) {
      return record.Items ? record.Items.map(i => unmarshall(i)) : []
    }

    this.logger.error({ err: serializeError(err), table, key: { [keyName]: keyValue } }, `Cannot Dynamo.Query after ${attempts} attempts`)
    throw new Error('Dynamo.Query')
  }

  /**
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.htm
   */
  async dynamoGetItem({ table, keyName, keyValue, projection = 'item', retries, retryDelay }) {
    if (!retries) { retries = this.dynamoOptions.maxRetries }
    if (!retryDelay) { retryDelay = this.dynamoOptions.retryDelay }

    const payload = JSON.stringify({
      TableName: table,
      Key: { [keyName]: { S: keyValue } },
      ProjectionExpression: projection
    })

    const headers = await signerWorker.run({
      url: this.dynamoUrl,
      region: this.dynamoOptions.region,
      keyId: this.credentials.keyId,
      accessKey: this.credentials.accessKey,
      sessionToken: this.credentials.sessionToken,
      service: 'dynamodb',
      method: 'POST',
      headers: { 'x-amz-target': 'DynamoDB_20120810.GetItem' },
      payload
    })

    let attempts = 0
    let err
    let record
    do {
      try {
        record = await this.dynamoRequest({ url: this.dynamoUrl, headers, payload })
        break
      } catch (error) {
        this.logger.debug(
          { err: serializeError(error), table, key: { [keyName]: keyValue } },
          `Cannot Dynamo.GetItem attempt ${attempts + 1} / ${retries}`
        )
        err = error
      }
      await sleep(retryDelay)
    } while (++attempts < retries)

    if (record?.Item) {
      return unmarshall(record.Item)
    }

    this.logger.error({ err: serializeError(err), table, key: { [keyName]: keyValue } }, `Cannot Dynamo.GetItem after ${attempts} attempts`)
    throw new Error('Dynamo.GetItem')
  }

  /**
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DescribeTable.html
   */
  async dynamoDescribeTable(table) {
    const payload = JSON.stringify({ TableName: table })

    const headers = await signerWorker.run({
      url: this.dynamoUrl,
      region: this.dynamoOptions.region,
      keyId: this.credentials.keyId,
      accessKey: this.credentials.accessKey,
      sessionToken: this.credentials.sessionToken,
      service: 'dynamodb',
      method: 'POST',
      headers: { 'x-amz-target': 'DynamoDB_20120810.DescribeTable' },
      payload
    })

    try {
      await this.dynamoRequest({ url: this.dynamoUrl, headers, payload })
      return true
    } catch (error) {
      this.logger.error({ err: serializeError(error), table }, 'Cannot Dynamo.DescribeTable')
      throw new Error('Dynamo.DescribeTable')
    }
  }

  async dynamoRequest({ url, headers, payload }) {
    const { statusCode, body } = await request(url, {
      method: 'POST',
      path: '/',
      headers: { ...headers, 'content-type': 'application/x-amz-json-1.0' },
      body: payload,
      dispatcher: this.agent
    })

    const buffer = new BufferList()
    for await (const chunk of body) {
      buffer.append(chunk)
    }

    if (statusCode >= 400) {
      throw new Error(`Dynamo request error - Status: ${statusCode} Body: ${buffer.slice().toString('utf-8')} `)
    }

    return JSON.parse(buffer.slice())
  }
}

module.exports = Client
