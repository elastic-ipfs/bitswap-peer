'use strict'

process.env.LOG_LEVEL = 'fatal'

const t = require('tap')
const { GetItemCommand } = require('@aws-sdk/client-dynamodb')
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { fetchBlockFromS3, searchCarInDynamo } = require('../src/storage')
const { dynamoMock, s3Mock } = require('./utils/mock')

t.test('searchCarInDynamo - error handling', async t => {
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

  t.rejects(searchCarInDynamo('table', 'key', 'error'), error)
})

t.test('fetchBlockFromS3 - safety checks', async t => {
  t.plan(2)

  const empty = await fetchBlockFromS3('bucket', 'key', 12345, 0)
  t.ok(Buffer.isBuffer(empty))
  t.equal(empty.length, 0)
})

t.test('fetchBlockFromS3 - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')
  s3Mock.on(GetObjectCommand, { Bucket: 'bucket', Key: 'error' }).rejects(error)

  t.rejects(fetchBlockFromS3('bucket', 'error'), 'FAILED')
})
