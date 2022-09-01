'use strict'

const { Readable } = require('stream')
const { readFileSync } = require('fs')
const { resolve } = require('path')
const { DynamoDBClient, GetItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { marshall } = require('@aws-sdk/util-dynamodb')
const { mockClient } = require('aws-sdk-client-mock')

const config = require('../../src/config')
const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('../fixtures/cids')
const { cidToKey } = require('../../src/util')

const dynamoMock = mockClient(DynamoDBClient)
const s3Mock = mockClient(S3Client)

function mockDynamoGetItemCommand({ table, keyName, keyValue, response = null }) {
  const params = { TableName: table, Key: marshall({ [keyName]: keyValue }) }

  if (typeof response === 'function') {
    dynamoMock.on(GetItemCommand, params).callsFake(response)
    return
  }
  dynamoMock.on(GetItemCommand, params).resolves({ Item: response })
}

function mockDynamoQueryCommand({ table, keyName, keyValue, response = [] }) {
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

function mockS3GetObject({ bucket, key, offset, length, response = null }) {
  const params = { Bucket: bucket, Key: key }
  if (offset || length) {
    params.Range = (offset ?? 0) + '-' + length
  }

  s3Mock
    .on(GetObjectCommand, params)
    .callsFake(async () => {
      if (typeof response === 'function') {
        response = await response()
      }

      return { Body: response, LastModified: new Date() }
    })
}

function mockBlockInfoSource({ key, info }) {
  mockDynamoQueryCommand({
    table: config.linkTableV1,
    keyName: config.linkTableBlockKey,
    keyValue: key,
    response: [{
      offset: { N: info.offset },
      length: { N: info.length },
      carpath: { S: info.car }
    }]
  })
}

function mockBlockDataSource({ bucket, offset, length, key, data }) {
  const response = new Readable()
  response.push(data)
  response.push(null)
  mockS3GetObject({ bucket, key, offset, length, response })
}

function readData(file, from, to) {
  const buffer = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`))
  const response = new Readable()
  response.push(from && to ? buffer.slice(from, to + 1) : buffer)
  response.push(null)

  return response
}

function readBlock(file) {
  const json = readFileSync(resolve(process.cwd(), `test/fixtures/${file}`), 'utf-8')
  return JSON.parse(json.replaceAll('{AWS_REGION}', process.env.AWS_REGION))
}

async function mockAWS() {
  // searchCarInDynamoV1
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid1), response: readBlock('blocks/db-v1/cid1.json') })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid2), response: readBlock('blocks/db-v1/cid2.json') })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid3) })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid4) })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid5), response: readBlock('blocks/db-v1/cid5.json') })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid6), response: readBlock('blocks/db-v1/cid6.json') })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid7), response: readBlock('blocks/db-v1/cid7.json') })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid8), response: readBlock('blocks/db-v1/cid8.json') })
  mockDynamoQueryCommand({ table: config.linkTableV1, keyName: config.linkTableBlockKey, keyValue: cidToKey(cid9), response: readBlock('blocks/db-v1/cid9.json') })

  // fetchS3
  mockS3GetObject({ key: 'test-cid1.car', bucket: 'test-cars', offset: 96, length: 100, response: readData('cars/test-cid1.car', 96, 100) })
  mockS3GetObject({ key: 'test-cid2.car', bucket: 'test-cars', offset: 96, length: 147, response: readData('cars/test-cid2.car', 96, 147) })
  mockS3GetObject({ key: 'test-cid5.car', bucket: 'test-cars', offset: 98, length: 1500097, response: readData('cars/test-cid5.car', 98, 1500097) })
  mockS3GetObject({ key: 'test-cid6.car', bucket: 'test-cars', offset: 98, length: 1500097, response: readData('cars/test-cid6.car', 98, 1500097) })
  mockS3GetObject({ key: 'test-cid7.car', bucket: 'test-cars', offset: 98, length: 1500097, response: readData('cars/test-cid7.car', 98, 1500097) })
  mockS3GetObject({ key: 'test-cid8.car', bucket: 'test-cars', offset: 98, length: 1500097, response: readData('cars/test-cid8.car', 98, 1500097) })
  mockS3GetObject({ key: 'test-cid9.car', bucket: 'test-cars', offset: 98, length: 2096749, response: readData('cars/test-cid9.car', 98, 2096749) })
}

module.exports = {
  mockAWS,
  mockDynamoGetItemCommand,
  mockDynamoQueryCommand,
  mockS3GetObject,
  mockBlockInfoSource,
  mockBlockDataSource
}
