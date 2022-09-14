'use strict'

const { readFileSync } = require('fs')
const { resolve } = require('path')
const { MockAgent } = require('undici')

const config = require('../../src/config')
const { Client: AwsClient, awsClientOptions } = require('../../src/aws-client')
const { cidToKey } = require('../../src/storage')
const helper = require('./helper')

const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('../fixtures/cids')

function readData(file, from, to) {
  const buffer = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`))

  return from && to ? buffer.slice(from, to + 1) : buffer
}

function readBlock(file, region, bucket) {
  const json = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`), 'utf-8')
  return JSON.parse(json
    .replaceAll('{AWS_REGION}', region)
    .replaceAll('{BUCKET}', bucket)
  )
}

function mockDynamoItem(pool, cid, response, times = 1) {
  pool
    .intercept({
      method: 'POST',
      path: '/',
      body: JSON.stringify({
        TableName: 'blocks',
        Key: { multihash: { S: cidToKey(cid) } },
        ProjectionExpression: 'cars'
      })
    })
    .reply(200, response ? { Item: response } : {})
    .times(times)
}

function mockDynamoQuery(pool, cid, response, times = 1) {
  pool
    .intercept({
      method: 'POST',
      path: '/',
      body: JSON.stringify({
        TableName: config.linkTableV1,
        Limit: 1,
        KeyConditionExpression: `${config.linkTableBlockKey} = :v`,
        ExpressionAttributeValues: { ':v': { S: cidToKey(cid) } }
      })
    })
    .reply(200, response ? { Items: response } : {})
    .times(times)
}

function mockS3Object(pool, key, range, response, times = 1) {
  const headers = range ? { range } : undefined

  pool
    .intercept({
      method: 'GET',
      path: `/${key}`,
      headers
    })
    .reply(200, response)
    .times(times)
}

function createMockAgent() {
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()

  return mockAgent
}

async function mockAwsClient(config) {
  const logger = helper.spyLogger()
  const options = awsClientOptions(config, logger)
  options.agent = createMockAgent()
  const awsClient = new AwsClient(options)
  await awsClient.init()
  return { awsClient, logger }
}

async function mockAWS(config) {
  const { awsClient, logger } = await mockAwsClient(config)
  const s3 = {
    region: 'region-test',
    bucket: 'bucket-test'
  }
  const dynamoInterceptor = awsClient.agent.get(awsClient.dynamoUrl)
  const s3Interceptor = awsClient.agent.get(awsClient.s3Url(s3.region, s3.bucket))

  // used in searchCarInDynamoV1
  mockDynamoQuery(dynamoInterceptor, cid1, readBlock('blocks/db-v1/cid1.json', s3.region, s3.bucket, s3.bucket), 1e3 + 1)
  mockDynamoQuery(dynamoInterceptor, cid2, readBlock('blocks/db-v1/cid2.json', s3.region, s3.bucket))
  mockDynamoQuery(dynamoInterceptor, cid3, false)
  mockDynamoQuery(dynamoInterceptor, cid4, false)
  mockDynamoQuery(dynamoInterceptor, cid5, readBlock('blocks/db-v1/cid5.json', s3.region, s3.bucket))
  mockDynamoQuery(dynamoInterceptor, cid6, readBlock('blocks/db-v1/cid6.json', s3.region, s3.bucket))
  mockDynamoQuery(dynamoInterceptor, cid7, readBlock('blocks/db-v1/cid7.json', s3.region, s3.bucket))
  mockDynamoQuery(dynamoInterceptor, cid8, readBlock('blocks/db-v1/cid8.json', s3.region, s3.bucket))
  mockDynamoQuery(dynamoInterceptor, cid9, readBlock('blocks/db-v1/cid9.json', s3.region, s3.bucket), 1e3 + 1)

  // searchCarInDynamoV0
  mockDynamoItem(dynamoInterceptor, cid1, readBlock('blocks/db-v0/cid1.json', s3.region, s3.bucket), 1e3 + 1)
  mockDynamoItem(dynamoInterceptor, cid2, readBlock('blocks/db-v0/cid2.json', s3.region, s3.bucket))
  mockDynamoItem(dynamoInterceptor, cid3, false)
  mockDynamoItem(dynamoInterceptor, cid4, false)
  mockDynamoItem(dynamoInterceptor, cid5, readBlock('blocks/db-v0/cid5.json', s3.region, s3.bucket))
  mockDynamoItem(dynamoInterceptor, cid6, readBlock('blocks/db-v0/cid6.json', s3.region, s3.bucket))
  mockDynamoItem(dynamoInterceptor, cid7, readBlock('blocks/db-v0/cid7.json', s3.region, s3.bucket))
  mockDynamoItem(dynamoInterceptor, cid8, readBlock('blocks/db-v0/cid8.json', s3.region, s3.bucket))
  mockDynamoItem(dynamoInterceptor, cid9, readBlock('blocks/db-v0/cid9.json', s3.region, s3.bucket), 1e3 + 1)

  mockS3Object(s3Interceptor, 'test-cid1.car', 'bytes=96-100', readData('cars/test-cid1.car', 96, 100), 1e4)
  mockS3Object(s3Interceptor, 'test-cid2.car', 'bytes=96-147', readData('cars/test-cid2.car', 96, 147))
  mockS3Object(s3Interceptor, 'test-cid5.car', 'bytes=98-1500097', readData('cars/test-cid5.car', 98, 1500097), 1e4)
  mockS3Object(s3Interceptor, 'test-cid6.car', 'bytes=98-1500097', readData('cars/test-cid6.car', 98, 1500097))
  mockS3Object(s3Interceptor, 'test-cid7.car', 'bytes=98-1500097', readData('cars/test-cid7.car', 98, 1500097))
  mockS3Object(s3Interceptor, 'test-cid8.car', 'bytes=98-1500097', readData('cars/test-cid8.car', 98, 1500097))
  mockS3Object(s3Interceptor, 'test-cid9.car', 'bytes=98-2096749', readData('cars/test-cid9.car', 98, 2096749), 1e3 + 1)

  return { awsClient, logger, s3 }
}

module.exports = { createMockAgent, mockAwsClient, mockAWS }
