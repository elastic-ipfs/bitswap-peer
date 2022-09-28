'use strict'

const t = require('tap')
const config = require('../src/config')

const { fetchBlockData, searchCarInDynamoV0, searchCarInDynamoV1 } = require('../src/storage')

const { mockAWS, createMockAgent } = require('./utils/mock')

t.test('searchCarInDynamoV0', async t => {
  t.test('HTTP error handling', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()
    awsClient.agent
      .get(awsClient.dynamoUrl)
      .intercept({
        method: 'POST',
        path: '/'
      })
      .reply(400, { message: 'FOO' })
      .times(2)

    await t.rejects(() => searchCarInDynamoV0({ awsClient, table: 'table', keyName: 'key', blockKey: 'not-a-key', retries: 2, retryDelay: 10 }), {
      message: 'Dynamo.GetItem'
    })

    t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.GetItem attempt 1 / 2')
    t.match(logger.messages.debug[0][0].err, /Dynamo request error - Status: 400 Body: {"message":"FOO"}/)
    t.equal(logger.messages.debug[0][0].table, 'table')
    t.same(logger.messages.debug[0][0].key, { key: 'not-a-key' })

    t.equal(logger.messages.error[0][1], 'Cannot Dynamo.GetItem after 2 attempts')
  })

  t.test('error handling', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()
    awsClient.agent
      .get(awsClient.dynamoUrl)
      .intercept({
        method: 'POST',
        path: '/'
      })
      .replyWithError(new Error('FAILED'))
      .times(3)

    await t.rejects(() => searchCarInDynamoV0({ awsClient, table: 'table', keyName: 'key', blockKey: 'key-value', retries: 3, retryDelay: 10 }), {
      message: 'Dynamo.GetItem'
    })
    t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.GetItem attempt 1 / 3')
    t.match(logger.messages.debug[0][0].err, /Error: FAILED/)
    t.equal(logger.messages.debug[0][0].table, 'table')
    t.same(logger.messages.debug[0][0].key, { key: 'key-value' })

    t.equal(logger.messages.error[0][1], 'Cannot Dynamo.GetItem after 3 attempts')
  })
})

t.test('searchCarInDynamoV1', async t => {
  t.test('HTTP error handling', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()
    awsClient.agent
      .get(awsClient.dynamoUrl)
      .intercept({
        method: 'POST',
        path: '/'
      })
      .reply(400, { message: 'FOO' })
      .times(2)

    await t.rejects(
      () =>
        searchCarInDynamoV1({
          awsClient,
          blockKey: 'not-a-key',
          retries: 2,
          retryDelay: 10
        }),
      {
        message: 'Dynamo.Query'
      }
    )

    t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.Query attempt 1 / 2')
    t.equal(logger.messages.debug[1][1], 'Cannot Dynamo.Query attempt 2 / 2')
    t.equal(logger.messages.error[0][1], 'Cannot Dynamo.Query after 2 attempts')
    t.match(logger.messages.error[0][0].err, /Dynamo request error - Status: 400 Body: {"message":"FOO"}/)
    t.equal(logger.messages.error[0][0].table, 'v1-blocks-cars-position')
    t.same(logger.messages.error[0][0].key, { blockmultihash: 'not-a-key' })
  })

  t.test('error handling', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()
    awsClient.agent
      .get(awsClient.dynamoUrl)
      .intercept({
        method: 'POST',
        path: '/'
      })
      .replyWithError(new Error('FAILED'))
      .times(3)

    await t.rejects(
      () =>
        searchCarInDynamoV1({
          awsClient,
          blockKey: 'key-value',
          retries: 3,
          retryDelay: 10
        }),
      {
        message: 'Dynamo.Query'
      }
    )

    t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.Query attempt 1 / 3')
    t.equal(logger.messages.debug[1][1], 'Cannot Dynamo.Query attempt 2 / 3')
    t.equal(logger.messages.error[0][1], 'Cannot Dynamo.Query after 3 attempts')
    t.match(logger.messages.error[0][0].err, /Error: FAILED/)
    t.equal(logger.messages.error[0][0].table, 'v1-blocks-cars-position')
    t.same(logger.messages.error[0][0].key, { blockmultihash: 'key-value' })
  })

  t.test('fallback to v0', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()

    const blockKey = 'the-block-key'
    awsClient.agent
      .get(awsClient.dynamoUrl)
      .intercept({
        method: 'POST',
        path: '/',
        body: JSON.stringify({
          TableName: config.linkTableV1,
          Limit: 1,
          KeyConditionExpression: `${config.linkTableBlockKey} = :v`,
          ExpressionAttributeValues: { ':v': { S: blockKey } }
        })
      })
      .reply(200, { Items: [] })

    awsClient.agent
      .get(awsClient.dynamoUrl)
      .intercept({
        method: 'POST',
        path: '/',
        body: JSON.stringify({
          TableName: config.blocksTable,
          Key: { [config.blocksTablePrimaryKey]: { S: blockKey } },
          ProjectionExpression: 'blocks'
        })
      })
      .reply(200, { Item: require('./fixtures/blocks/db-v0/cid1.json') })

    t.same(await searchCarInDynamoV1({ awsClient, logger, blockKey, retries: 1, retryDelay: 1 }), {
      offset: 96,
      length: 5,
      car: '{AWS_REGION}/{BUCKET}/test-cid1.car'
    })
    t.equal(logger.info.length, 0)
    t.equal(logger.messages.error[0][1], 'block not found in V1 table but found in V0 table')
  })
})

t.test('fetchBlockData', async t => {
  const region = 'the-region'
  const bucket = 'the-bucket'

  t.test('should get an empty buffer calling with length zero', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()

    const empty = await fetchBlockData({ awsClient, region, bucket, key: 'key', offset: 12345, length: 0 })
    t.ok(Buffer.isBuffer(empty))
    t.equal(empty.length, 0)
    t.same(logger.messages.warn[0], [{ key: 'key' }, 'Called s3Fetch with length 0'])
  })

  t.test('error handling, s3 request fails after all retries', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()

    awsClient.agent
      .get(awsClient.s3Url(region, bucket))
      .intercept({ method: 'GET', path: '/error' })
      .reply(400, { message: 'FOO' })

    await t.rejects(
      () => fetchBlockData({ awsClient, region, bucket, key: 'error', offset: 1, length: 1, retries: 3, retryDelay: 0 }),
      'Cannot S3.fetch https://the-bucket.s3.the-region.amazonaws.com/error'
    )
    t.same(
      logger.messages.error[0], [
        { key: 'error' },
        'Cannot S3.fetch https://the-bucket.s3.the-region.amazonaws.com/error after 3 attempts'
      ])
  })

  t.test('error handling, s3 request fails fetching', async t => {
    const { awsClient } = await mockAWS(config)
    awsClient.agent = createMockAgent()

    awsClient.agent
      .get('https://the-bucket.s3.the-region.amazonaws.com')
      .intercept({ method: 'GET', path: '/error' })
      .replyWithError(new Error('FAILED'))

    await t.rejects(() => fetchBlockData({ awsClient, region, bucket, key: 'error', offset: 1, length: 1, retries: 3, retryDelay: 0 }), 'FAILED')
  })

  t.test('error handling, s3 request fails because of not found', async t => {
    const { awsClient, logger } = await mockAWS(config)
    awsClient.agent = createMockAgent()

    awsClient.agent
      .get('https://the-bucket.s3.the-region.amazonaws.com')
      .intercept({ method: 'GET', path: '/not-a-resource' })
      .reply(404, { message: 'FOO' })

    await t.rejects(
      () => fetchBlockData({ awsClient, region, bucket, key: 'not-a-resource', offset: 1, length: 1, retries: 3, retryDelay: 0 }),
      'NOT_FOUND'
    )

    t.same(logger.messages.error[0], [{ url: 'https://the-bucket.s3.the-region.amazonaws.com/not-a-resource' }, 'S3 Not Found'])
  })
})
