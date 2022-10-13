'use strict'

const { readFileSync } = require('fs')
const { resolve } = require('path')
const { MockAgent } = require('undici')

const config = require('../../src/config')
const { Client: AwsClient, awsClientOptions } = require('../../src/aws-client')
const { cidToKey } = require('../../src/util')
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

function mockDynamoItem({ pool, table, keyName, key, response, times = 1 }) {
  pool
    .intercept({
      method: 'POST',
      path: '/',
      body: JSON.stringify({
        TableName: table,
        Key: { [keyName]: { S: key } }
      })
    })
    .reply(200, response
      ? typeof response === 'function' ? response : { Item: response }
      : {})
    .times(times)
}

function mockDynamoQuery({ pool, table, keyName, key, response, times = 1 }) {
  pool
    .intercept({
      method: 'POST',
      path: '/',
      body: JSON.stringify({
        TableName: table,
        Limit: 1,
        KeyConditionExpression: `${keyName} = :v`,
        ExpressionAttributeValues: { ':v': { S: key } }
      })
    })
    .reply(200, response
      ? typeof response === 'function' ? response : { Items: response }
      : {})
    .times(times)
}

function mockS3Object({ pool, key, range, response, times = 1 }) {
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

function mockBlockInfoSource({ awsClient, key, info, times = 1 }) {
  const pool = awsClient.agent.get(awsClient.dynamoUrl)

  mockDynamoQuery({
    pool,
    table: config.linkTableV1,
    keyName: config.linkTableBlockKey,
    key,
    response: [{
      offset: { N: info.offset },
      length: { N: info.length },
      carpath: { S: info.car }
    }],
    times
  })
}

function mockBlockDataSource({ awsClient, region, bucket, offset, length, key, data, times = 1 }) {
  const pool = awsClient.agent.get(awsClient.s3Url(region, bucket))

  mockS3Object({ pool, bucket, key, offset, length, response: data, times })
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

// TODO remove this massive mock
async function mockAWS(config) {
  const { awsClient, logger } = await mockAwsClient(config)
  const s3 = {
    region: 'region-test',
    bucket: 'bucket-test'
  }
  const dynamoInterceptor = awsClient.agent.get(awsClient.dynamoUrl)
  const s3Interceptor = awsClient.agent.get(awsClient.s3Url(s3.region, s3.bucket))

  // used in searchCarInDynamoV1
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid1), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: readBlock('blocks/db-v1/cid1.json', s3.region, s3.bucket), times: 999 })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid2), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: readBlock('blocks/db-v1/cid2.json', s3.region, s3.bucket), times: 999 })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid3), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: false })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid4), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: false })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid5), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: readBlock('blocks/db-v1/cid5.json', s3.region, s3.bucket) })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid6), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: readBlock('blocks/db-v1/cid6.json', s3.region, s3.bucket) })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid7), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: readBlock('blocks/db-v1/cid7.json', s3.region, s3.bucket) })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid8), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: readBlock('blocks/db-v1/cid8.json', s3.region, s3.bucket) })
  mockDynamoQuery({ pool: dynamoInterceptor, key: cidToKey(cid9), table: config.linkTableV1, keyName: config.linkTableBlockKey, response: readBlock('blocks/db-v1/cid9.json', s3.region, s3.bucket), times: 999 })

  // searchCarInDynamoV0
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid1), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: readBlock('blocks/db-v0/cid1.json', s3.region, s3.bucket), times: 999 })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid2), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: readBlock('blocks/db-v0/cid2.json', s3.region, s3.bucket) })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid3), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: false })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid4), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: false })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid5), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: readBlock('blocks/db-v0/cid5.json', s3.region, s3.bucket) })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid6), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: readBlock('blocks/db-v0/cid6.json', s3.region, s3.bucket) })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid7), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: readBlock('blocks/db-v0/cid7.json', s3.region, s3.bucket) })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid8), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: readBlock('blocks/db-v0/cid8.json', s3.region, s3.bucket) })
  mockDynamoItem({ pool: dynamoInterceptor, key: cidToKey(cid9), table: config.blocksTable, keyName: config.blocksTablePrimaryKey, response: readBlock('blocks/db-v0/cid9.json', s3.region, s3.bucket), times: 999 })

  mockS3Object({ pool: s3Interceptor, key: 'test-cid1.car', range: 'bytes=96-100', response: readData('cars/test-cid1.car', 96, 100), times: 999 })
  mockS3Object({ pool: s3Interceptor, key: 'test-cid2.car', range: 'bytes=96-147', response: readData('cars/test-cid2.car', 96, 147), times: 999 })
  mockS3Object({ pool: s3Interceptor, key: 'test-cid5.car', range: 'bytes=98-1500097', response: readData('cars/test-cid5.car', 98, 1500097), times: 999 })
  mockS3Object({ pool: s3Interceptor, key: 'test-cid6.car', range: 'bytes=98-1500097', response: readData('cars/test-cid6.car', 98, 1500097) })
  mockS3Object({ pool: s3Interceptor, key: 'test-cid7.car', range: 'bytes=98-1500097', response: readData('cars/test-cid7.car', 98, 1500097) })
  mockS3Object({ pool: s3Interceptor, key: 'test-cid8.car', range: 'bytes=98-1500097', response: readData('cars/test-cid8.car', 98, 1500097) })
  mockS3Object({ pool: s3Interceptor, key: 'test-cid9.car', range: 'bytes=98-2096749', response: readData('cars/test-cid9.car', 98, 2096749), times: 999 })

  return { awsClient, logger, s3 }
}

module.exports = {
  createMockAgent,
  mockAwsClient,
  mockAWS,
  mockDynamoQuery,
  mockDynamoItem,
  mockS3Object,
  mockBlockInfoSource,
  mockBlockDataSource
}
