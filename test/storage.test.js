'use strict'

process.env.LOG_LEVEL = 'fatal'

const t = require('tap')
const { GetItemCommand } = require('@aws-sdk/client-dynamodb')
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { fetchS3Object, readDynamoItem } = require('../src/storage')
const { dynamoMock, s3Mock } = require('./utils/mock')

t.test('readDynamoItem - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')
  dynamoMock
    .on(GetItemCommand, {
      TableName: 'table',
      Key: {
        key: { S: 'error' }
      }
    })
    .rejects(error)

  t.rejects(readDynamoItem('table', 'key', 'error'), error)
})

t.test('fetchS3Object - safety checks', async t => {
  t.plan(2)

  const empty = await fetchS3Object('bucket', 'key', 12345, 0)
  t.ok(Buffer.isBuffer(empty))
  t.equal(empty.length, 0)
})

t.test('fetchS3Object - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')
  s3Mock.on(GetObjectCommand, { Bucket: 'bucket', Key: 'error' }).rejects(error)

  t.rejects(fetchS3Object('bucket', 'error'), 'FAILED')
})
