'use strict'

const { readFileSync } = require('fs')
const { resolve } = require('path')
const { DynamoDBClient, GetItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { marshall } = require('@aws-sdk/util-dynamodb')
const { mockClient } = require('aws-sdk-client-mock')

const config = require('../../src/config')
const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('../fixtures/cids')
const { cidToKey } = require('../../src/storage')

const dynamoMock = mockClient(DynamoDBClient)
const s3Mock = mockClient(S3Client)

function mockDynamoGetItemCommand({ table, keyName, keyValue, response }) {
  const params = { TableName: table, Key: marshall({ [keyName]: keyValue }) }

  if (typeof response === 'function') {
    dynamoMock.on(GetItemCommand, params).callsFake(response)
    return
  }
  dynamoMock.on(GetItemCommand, params).resolves({ Item: response })
}

function mockDynamoQueryCommand({ table, keyName, keyValue, response }) {
  const params = {
    TableName: table,
    Limit: 1,
    KeyConditionExpression: `${keyName} = :v`,
    ExpressionAttributeValues: marshall({ ':v': keyValue }, { removeUndefined: true })
  }

  if (typeof response === 'function') {
    dynamoMock.on(QueryCommand, params).callsFake(response)
    return
  }
  dynamoMock.on(QueryCommand, params).resolves({ Items: response })
}

function mockS3GetObject({ bucket, key, length, response }) {
  s3Mock
    .on(GetObjectCommand, {
      Bucket: bucket,
      Key: key
    })
    .callsFake(async () => {
      if (typeof response === 'function') {
        response = await response()
      }

      return { Body: response, ContentLength: length, LastModified: new Date() }
    })
}

function readData(file, from, to) {
  const buffer = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`))

  return from && to ? buffer.slice(from, to + 1) : buffer
}

function readBlock(file) {
  const json = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`), 'utf-8')
  return JSON.parse(json.replaceAll('{AWS_REGION}', process.env.AWS_REGION))
}

async function mockAWS(t) {
  //   const s3 = mockAgent.get(`https://test-cars.s3.${process.env.AWS_REGION}.amazonaws.com`)
  //   const dynamo = mockAgent.get(`https://dynamodb.${process.env.AWS_REGION}.amazonaws.com`)

  //   // used in searchCarInDynamoV1
  //   mockDynamoQuery(dynamo, cid1, readBlock('blocks/db-v1/cid1.json'), 1e3 + 1)
  //   mockDynamoQuery(dynamo, cid2, readBlock('blocks/db-v1/cid2.json'))
  //   mockDynamoQuery(dynamo, cid3, false)
  //   mockDynamoQuery(dynamo, cid4, false)
  //   mockDynamoQuery(dynamo, cid5, readBlock('blocks/db-v1/cid5.json'))
  //   mockDynamoQuery(dynamo, cid6, readBlock('blocks/db-v1/cid6.json'))
  //   mockDynamoQuery(dynamo, cid7, readBlock('blocks/db-v1/cid7.json'))
  //   mockDynamoQuery(dynamo, cid8, readBlock('blocks/db-v1/cid8.json'))
  //   mockDynamoQuery(dynamo, cid9, readBlock('blocks/db-v1/cid9.json'), 1e3 + 1)

  //   // searchCarInDynamoV0
  //   mockDynamoItem(dynamo, cid1, readBlock('blocks/db-v0/cid1.json'), 1e3 + 1)
  //   mockDynamoItem(dynamo, cid2, readBlock('blocks/db-v0/cid2.json'))
  //   mockDynamoItem(dynamo, cid3, false)
  //   mockDynamoItem(dynamo, cid4, false)
  //   mockDynamoItem(dynamo, cid5, readBlock('blocks/db-v0/cid5.json'))
  //   mockDynamoItem(dynamo, cid6, readBlock('blocks/db-v0/cid6.json'))
  //   mockDynamoItem(dynamo, cid7, readBlock('blocks/db-v0/cid7.json'))
  //   mockDynamoItem(dynamo, cid8, readBlock('blocks/db-v0/cid8.json'))
  //   mockDynamoItem(dynamo, cid9, readBlock('blocks/db-v0/cid9.json'), 1e3 + 1)

  //   mockS3Object(s3, 'test-cid1.car', 'bytes=96-100', readData('cars/test-cid1.car', 96, 100), 1e4)
  //   mockS3Object(s3, 'test-cid2.car', 'bytes=96-147', readData('cars/test-cid2.car', 96, 147))
  //   mockS3Object(s3, 'test-cid5.car', 'bytes=98-1500097', readData('cars/test-cid5.car', 98, 1500097), 1e4)
  //   mockS3Object(s3, 'test-cid6.car', 'bytes=98-1500097', readData('cars/test-cid6.car', 98, 1500097))
  //   mockS3Object(s3, 'test-cid7.car', 'bytes=98-1500097', readData('cars/test-cid7.car', 98, 1500097))
  //   mockS3Object(s3, 'test-cid8.car', 'bytes=98-1500097', readData('cars/test-cid8.car', 98, 1500097))
  //   mockS3Object(s3, 'test-cid9.car', 'bytes=98-2096749', readData('cars/test-cid9.car', 98, 2096749), 1e3 + 1)

  //   t.context = { s3Pool: s3, dynamoPool: dynamo }
  //   return mockAgent
}

module.exports = { mockAWS, mockDynamoGetItemCommand, mockDynamoQueryCommand, mockS3GetObject }
