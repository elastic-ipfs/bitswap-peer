'use strict'

const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { mockClient } = require('aws-sdk-client-mock')
const { readFileSync } = require('fs')
const { resolve } = require('path')
const { setTimeout: sleep } = require('timers/promises')
const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('./helpers')
const { cidToKey } = require('../../src/storage')
const { Readable } = require('stream')

const dynamoMock = mockClient(DynamoDBClient)
const s3Mock = mockClient(S3Client)

function readData(file, from, to) {
  const buffer = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`))

  return from && to ? buffer.slice(from, to + 1) : buffer
}

function readBlock(file, ...args) {
  return JSON.parse(readFileSync(resolve(process.cwd(), `test/fixtures/${file}`), 'utf-8'))
}

function mockDynamoItem(cid, response) {
  dynamoMock
    .on(GetItemCommand, {
      TableName: 'blocks',
      Key: {
        multihash: { S: cidToKey(cid) }
      }
    })
    .resolves({ Item: response })
}

function mockS3Object(bucket, key, range, response, index) {
  s3Mock
    .on(GetObjectCommand, {
      Bucket: bucket,
      Key: key,
      Range: range
    })
    // Recreate the stream every time in order to being able to return the same content multiple times
    .callsFake(async () => {
      // Introduce delays so that we simulate a bit of network latency and replies are in order
      await sleep(index * 100)

      return { Body: response ? Readable.from(response) : undefined }
    })
}

function mockAWS(t) {
  t.jobs = 10

  mockDynamoItem(cid1, readBlock('blocks/cid1.json', 'utf8'))
  mockDynamoItem(cid2, readBlock('blocks/cid2.json', 'utf8'))
  mockDynamoItem(cid3, undefined)
  mockDynamoItem(cid4, undefined)
  mockDynamoItem(cid5, readBlock('blocks/cid5.json', 'utf8'))
  mockDynamoItem(cid6, readBlock('blocks/cid6.json', 'utf8'))
  mockDynamoItem(cid7, readBlock('blocks/cid7.json', 'utf8'))
  mockDynamoItem(cid8, readBlock('blocks/cid8.json', 'utf8'))
  mockDynamoItem(cid9, readBlock('blocks/cid9.json', 'utf8'))

  mockS3Object(process.env.PEER_ID_S3_BUCKET, process.env.PEER_ID_FILE, undefined, readData('peerId.json'))
  mockS3Object('test-cars', 'test-cid1.car', 'bytes=96-100', readData('cars/test-cid1.car', 96, 100))
  mockS3Object('test-cars', 'test-cid2.car', 'bytes=96-147', readData('cars/test-cid2.car', 96, 147))
  mockS3Object('test-cars', 'test-cid5.car', 'bytes=98-1500097', readData('cars/test-cid5.car', 98, 1500097), 1)
  mockS3Object('test-cars', 'test-cid6.car', 'bytes=98-1500097', readData('cars/test-cid6.car', 98, 1500097), 2)
  mockS3Object('test-cars', 'test-cid7.car', 'bytes=98-1500097', readData('cars/test-cid7.car', 98, 1500097), 3)
  mockS3Object('test-cars', 'test-cid8.car', 'bytes=98-1500097', readData('cars/test-cid8.car', 98, 1500097), 4)
  mockS3Object('test-cars', 'test-cid9.car', 'bytes=98-2096749', readData('cars/test-cid9.car', 98, 2096749), 5)
}

module.exports = { mockAWS, dynamoMock, s3Mock }
