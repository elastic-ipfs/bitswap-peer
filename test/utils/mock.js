'use strict'

const { readFileSync } = require('fs')
const { resolve } = require('path')
const { MockAgent } = require('undici')

const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('../fixtures/cids')
const { cidToKey, ensureAwsCredentials } = require('../../src/storage')

function readData(file, from, to) {
  const buffer = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`))

  return from && to ? buffer.slice(from, to + 1) : buffer
}

function readBlock(file) {
  return JSON.parse(readFileSync(resolve(process.cwd(), `test/fixtures/${file}`), 'utf-8'))
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

function mockS3Object(pool, key, range, response, times = 1) {
  pool
    .intercept({ method: 'GET', path: `/${key}` })
    .reply(200, response)
    .times(times)
}

function createMockAgent() {
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()

  return mockAgent
}

async function mockAWS(t) {
  await ensureAwsCredentials()
  const mockAgent = createMockAgent()

  const s3 = mockAgent.get(`https://test-cars.s3.${process.env.AWS_REGION}.amazonaws.com`)
  const dynamo = mockAgent.get(`https://dynamodb.${process.env.AWS_REGION}.amazonaws.com`)

  mockDynamoItem(dynamo, cid1, readBlock('blocks/cid1.json'), 1e3 + 1)
  mockDynamoItem(dynamo, cid2, readBlock('blocks/cid2.json'))
  mockDynamoItem(dynamo, cid3, false)
  mockDynamoItem(dynamo, cid4, false)
  mockDynamoItem(dynamo, cid5, readBlock('blocks/cid5.json'))
  mockDynamoItem(dynamo, cid6, readBlock('blocks/cid6.json'))
  mockDynamoItem(dynamo, cid7, readBlock('blocks/cid7.json'))
  mockDynamoItem(dynamo, cid8, readBlock('blocks/cid8.json'))
  mockDynamoItem(dynamo, cid9, readBlock('blocks/cid9.json'), 1e3 + 1)

  mockS3Object(s3, 'test-cid1.car', 'bytes=96-100', readData('cars/test-cid1.car', 96, 100), 1e4)
  mockS3Object(s3, 'test-cid2.car', 'bytes=96-147', readData('cars/test-cid2.car', 96, 147))
  mockS3Object(s3, 'test-cid5.car', 'bytes=98-1500097', readData('cars/test-cid5.car', 98, 1500097), 1e4)
  mockS3Object(s3, 'test-cid6.car', 'bytes=98-1500097', readData('cars/test-cid6.car', 98, 1500097))
  mockS3Object(s3, 'test-cid7.car', 'bytes=98-1500097', readData('cars/test-cid7.car', 98, 1500097))
  mockS3Object(s3, 'test-cid8.car', 'bytes=98-1500097', readData('cars/test-cid8.car', 98, 1500097))
  mockS3Object(s3, 'test-cid9.car', 'bytes=98-2096749', readData('cars/test-cid9.car', 98, 2096749), 1e3 + 1)

  t.context = { s3Pool: s3, dynamoPool: dynamo }
  return mockAgent
}

module.exports = { createMockAgent, mockAWS }
