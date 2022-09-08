'use strict'

process.env.LOG_LEVEL = 'fatal'

const t = require('tap')
const sinon = require('sinon')
const config = require('../src/config')
const { logger } = require('../src/logging')

const { fetchS3, searchCarInDynamoV0, searchCarInDynamoV1 } = require('../src/storage')
const { createMockAgent } = require('./utils/mock')
const bucketRegion = process.env.AWS_REGION

t.todo('searchCarInDynamoV0', async t => {
  const sandbox = sinon.createSandbox()

  t.beforeEach(() => {
    sandbox.spy(logger)
  })

  t.afterEach(() => {
    sandbox.restore()
  })

  t.todo('HTTP error handling', async t => {
    const mockAgent = createMockAgent()
    mockAgent
      .get('https://dynamodb.us-west-2.amazonaws.com')
      .intercept({
        method: 'POST',
        path: '/'
      })
      .reply(400, { message: 'FOO' })
      .times(2)

    await t.rejects(() => searchCarInDynamoV0(mockAgent, 'table', 'key', 'not-a-key', 2, 10), {
      message: 'Cannot get item from Dynamo Table: table Key: not-a-key'
    })
    t.match(
      logger.debug.getCall(0).lastArg,
      'Cannot get item from DynamoDB attempt 1 / 2 - Table: table Key: not-a-key Error: [Error] DynamoDB.GetItem - Status: 400 Body: {"message":"FOO"}'
    )
    t.match(
      logger.debug.getCall(1).lastArg,
      'Cannot get item from DynamoDB attempt 2 / 2 - Table: table Key: not-a-key Error: [Error] DynamoDB.GetItem - Status: 400 Body: {"message":"FOO"}'
    )
    t.match(logger.error.getCall(0).lastArg, /from Dynamo after 2 attempts/)
  })

  t.todo('error handling', async t => {
    const error = new Error('FAILED')
    const mockAgent = createMockAgent()
    mockAgent
      .get('https://dynamodb.us-west-2.amazonaws.com')
      .intercept({
        method: 'POST',
        path: '/'
      })
      .replyWithError(error)
      .times(3)

    await t.rejects(() => searchCarInDynamoV0(mockAgent, 'table', 'key', 'key-value', 3, 10), {
      message: 'Cannot get item from Dynamo Table: table Key: key-value'
    })
    t.match(
      logger.debug.getCall(0).lastArg,
      'Cannot get item from DynamoDB attempt 1 / 3 - Table: table Key: key-value Error: [Error] FAILED'
    )
    t.match(
      logger.debug.getCall(1).lastArg,
      'Cannot get item from DynamoDB attempt 2 / 3 - Table: table Key: key-value Error: [Error] FAILED'
    )
    t.match(
      logger.debug.getCall(2).lastArg,
      'Cannot get item from DynamoDB attempt 3 / 3 - Table: table Key: key-value Error: [Error] FAILED'
    )
    t.match(logger.error.getCall(0).lastArg, /from Dynamo after 3 attempts/)
  })
})

t.todo('searchCarInDynamoV1', async t => {
  t.todo('HTTP error handling', async t => {
    const mockAgent = createMockAgent()
    mockAgent
      .get('https://dynamodb.us-west-2.amazonaws.com')
      .intercept({
        method: 'POST',
        path: '/'
      })
      .reply(400, { message: 'FOO' })
      .times(2)
    const logs = { debug: [], error: [] }
    const loggerSpy = {
      debug: (info, message) => {
        logs.debug.push({ info, message })
      },
      error: (info, message) => {
        logs.error.push({ info, message })
      }
    }

    await t.rejects(
      () =>
        searchCarInDynamoV1({
          // dispatcher: mockAgent,
          blockKey: 'not-a-key',
          logger: loggerSpy,
          retries: 2,
          retryDelay: 10
        }),
      {
        message: 'Cannot query Dynamo'
      }
    )
    t.equal(logs.debug[0].message, 'Cannot query DynamoDB attempt 1 / 2')
    t.equal(logs.debug[1].message, 'Cannot query DynamoDB attempt 2 / 2')
    t.match(logs.error[0].message, /query Dynamo after 2 attempts/)
  })

  t.todo('error handling', async t => {
    const error = new Error('FAILED')
    const mockAgent = createMockAgent()
    mockAgent
      .get('https://dynamodb.us-west-2.amazonaws.com')
      .intercept({
        method: 'POST',
        path: '/'
      })
      .replyWithError(error)
      .times(3)
    const logs = { debug: [], error: [] }
    const loggerSpy = {
      debug: (info, message) => {
        logs.debug.push({ info, message })
      },
      error: (info, message) => {
        logs.error.push({ info, message })
      }
    }

    await t.rejects(
      () =>
        searchCarInDynamoV1({
          // dispatcher: mockAgent,
          blockKey: 'not-a-key',
          logger: loggerSpy,
          retries: 3,
          retryDelay: 10
        }),
      {
        message: 'Cannot query Dynamo'
      }
    )
    t.equal(logs.debug[0].message, 'Cannot query DynamoDB attempt 1 / 3')
    t.equal(logs.debug[1].message, 'Cannot query DynamoDB attempt 2 / 3')
    t.equal(logs.debug[2].message, 'Cannot query DynamoDB attempt 3 / 3')
    t.match(logs.error[0].message, /query Dynamo after 3 attempts/)
  })

  t.todo('fallback to v0', async t => {
    const blockKey = 'the-block-key'
    const mockAgent = createMockAgent()
    mockAgent
      .get('https://dynamodb.us-west-2.amazonaws.com')
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
    mockAgent
      .get('https://dynamodb.us-west-2.amazonaws.com')
      .intercept({
        method: 'POST',
        path: '/'
      })
      .reply(200, { Item: require('./fixtures/blocks/db-v0/cid1.json') })

    const logs = { debug: [], info: [], error: [] }
    const loggerSpy = {
      debug: (info, message) => {
        logs.debug.push({ info, message })
      },
      info: (info, message) => {
        logs.info.push({ info, message })
      },
      error: (info, message) => {
        logs.error.push({ info, message })
      }
    }

    t.same(await searchCarInDynamoV1({ dispatcher: mockAgent, blockKey, logger: loggerSpy }), {
      offset: 96,
      length: 5,
      car: '{AWS_REGION}/test-cars/test-cid1.car'
    })
    t.match(logs.info.length, 0)
    t.equal(logs.error[0].message, 'block not found in V1 table but found in V0 table')
  })
})

t.todo('fetchS3', async t => {
  const sandbox = sinon.createSandbox()

  t.beforeEach(() => {
    sandbox.spy(logger)
  })

  t.afterEach(() => {
    sandbox.restore()
  })

  t.todo('safety checks', async t => {
    const mockAgent = createMockAgent()
    const empty = await fetchS3(mockAgent, bucketRegion, 'bucket', 'key', 12345, 0)
    t.ok(Buffer.isBuffer(empty))
    t.equal(empty.length, 0)
    t.ok(logger.warn.calledOnceWith({ key: 'key' }, 'Called fetch S3 with length 0'))
  })

  t.todo('error handling, s3 request fails after all retries', async t => {
    const mockAgent = createMockAgent()
    mockAgent
      .get('https://bucket.s3.us-west-2.amazonaws.com')
      .intercept({ method: 'GET', path: '/error' })
      .reply(400, { message: 'FOO' })

    await t.rejects(
      () => fetchS3(mockAgent, bucketRegion, 'bucket', 'error', 1, 1, 3, 0),
      'Cannot download from S3 https://bucket.s3.us-west-2.amazonaws.com/error'
    )
    t.ok(
      logger.error.calledWith(
        { key: 'error' },
        'Cannot download from S3 https://bucket.s3.us-west-2.amazonaws.com/error after 3 attempts'
      )
    )
  })

  t.todo('error handling, s3 request fails fetching', async t => {
    const error = new Error('FAILED')

    const mockAgent = createMockAgent()
    mockAgent
      .get('https://bucket.s3.us-west-2.amazonaws.com')
      .intercept({ method: 'GET', path: '/error' })
      .replyWithError(error)

    await t.rejects(() => fetchS3(mockAgent, bucketRegion, 'bucket', 'error', 1, 1, 3, 0), 'FAILED')
  })

  t.todo('error handling, s3 request fails because of not found', async t => {
    const mockAgent = createMockAgent()
    mockAgent
      .get('https://bucket.s3.us-west-2.amazonaws.com')
      .intercept({ method: 'GET', path: '/not-a-resource' })
      .reply(404, { message: 'FOO' })

    await t.rejects(
      () => fetchS3(mockAgent, bucketRegion, 'bucket', 'not-a-resource', 1, 1, 3, 0),
      'NOT_FOUND'
    )
    t.ok(logger.error.calledWith({ url: 'https://bucket.s3.us-west-2.amazonaws.com/not-a-resource' }, 'Not Found S3'))
  })
})
