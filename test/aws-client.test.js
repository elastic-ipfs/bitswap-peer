'use strict'

const t = require('tap')

const path = require('path')
const fs = require('fs').promises
const { Agent, MockAgent } = require('undici')
const { marshall } = require('@aws-sdk/util-dynamodb')
const config = require('../src/config')
const { awsClientOptions, Client } = require('../src/aws-client')
const helper = require('./utils/helper')
const { createMockAgent } = require('./utils/mock')

t.test('Client', async t => {
  t.test('constructor', async t => {
    t.test('should create a client instance', async t => {
      const client = new Client({ dynamoOptions: { region: 'dynamo-region' } })
      t.ok(client)
    })

    t.test('should get error on missing dynamo region', async t => {
      t.throws(() => new Client({}), 'missing dynamo region')
    })
  })

  t.test('init', async t => {
    t.test('should init the client with a new agent', async t => {
      const client = new Client({ dynamoOptions: { region: 'dynamo-region' } })
      await client.init()

      t.ok(client.agent instanceof Agent)
      client.close()
    })

    t.test('should init the client with an custom agent', async t => {
      const client = new Client({ agent: createMockAgent(), refreshCredentialsInterval: null, dynamoOptions: { region: 'dynamo-region' } })
      await client.init()

      t.ok(client.agent instanceof MockAgent)
      t.notOk(client.credentialRefreshTimer, 'must not ensure credentials')
    })

    t.test('should init the client loading the AWS_WEB_IDENTITY_TOKEN_FILE', async t => {
      process.env.AWS_ROLE_ARN = ''
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE = 'test-aws-identity-token'
      process.env.AWS_ACCESS_KEY_ID = ''
      process.env.AWS_SECRET_ACCESS_KEY = ''

      await fs.writeFile(path.resolve(process.cwd(), process.env.AWS_WEB_IDENTITY_TOKEN_FILE), 'the-token', 'utf8')

      const client = new Client({ dynamoOptions: { region: 'dynamo-region' } })
      await client.init()

      t.equal(client.identityToken, 'the-token')
    })

    t.test('should init the client using AWS_ROLE_ARN', async t => {
      process.env.AWS_ROLE_ARN = 'the-role-arn'
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE = ''
      process.env.AWS_ACCESS_KEY_ID = ''
      process.env.AWS_SECRET_ACCESS_KEY = ''

      const client = new Client({ dynamoOptions: { region: 'dynamo-region' } })
      await client.init()

      t.equal(client.roleArn, 'the-role-arn')
    })

    t.test('should init the client using AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY', async t => {
      process.env.AWS_ROLE_ARN = ''
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE = ''
      process.env.AWS_ACCESS_KEY_ID = 'the-key'
      process.env.AWS_SECRET_ACCESS_KEY = 'the-secret'

      const client = new Client({ dynamoOptions: { region: 'dynamo-region' } })
      await client.init()

      t.equal(client.credentials.keyId, 'the-key')
      t.equal(client.credentials.accessKey, 'the-secret')
    })
  })

  t.test('refreshCredentials', async t => {
    t.test('should refresh credentials', async t => {
      const options = awsClientOptions(config, helper.dummyLogger())
      options.roleArn = 'role'
      options.identityToken = 'identity'
      options.roleSessionName = 'bitswap-peer'
      options.agent = createMockAgent()

      const client = new Client(options)
      client.agent
        .get('https://sts.amazonaws.com')
        .intercept({
          method: 'GET',
          path: '/?Version=2011-06-15&Action=AssumeRoleWithWebIdentity&RoleArn=role&RoleSessionName=bitswap-peer&WebIdentityToken=identity'
        })
        .reply(
          200,
          `
        <AssumeRoleWithWebIdentityResponse>
          <AssumeRoleWithWebIdentityResult>
            <Credentials>
              <SessionToken>sessionToken</SessionToken>
              <SecretAccessKey>accessKey</SecretAccessKey>
              <AccessKeyId>keyId</AccessKeyId>
            </Credentials>
          </AssumeRoleWithWebIdentityResult>
        </AssumeRoleWithWebIdentityResponse>
        `
        )

      await client.refreshCredentials()
      t.equal(client.credentials.keyId, 'keyId')
      t.equal(client.credentials.accessKey, 'accessKey')
      t.equal(client.credentials.sessionToken, 'sessionToken')
    })

    t.test('should handle error refreshing credentials', async t => {
      const logger = helper.spyLogger()
      const options = awsClientOptions(config, logger)
      options.roleArn = 'role'
      options.identityToken = 'identity'
      options.roleSessionName = 'bitswap-peer'
      options.agent = createMockAgent()

      const client = new Client(options)
      client.agent
        .get('https://sts.amazonaws.com')
        .intercept({
          method: 'GET',
          path: '/?Version=2011-06-15&Action=AssumeRoleWithWebIdentity&RoleArn=role&RoleSessionName=bitswap-peer&WebIdentityToken=identity'
        })
        .reply(400, 'FOO')

      await t.rejects(() => client.refreshCredentials(), {
        message: 'Cannot refresh AWS credentials: AssumeRoleWithWebIdentity failed with HTTP error 400 and body: FOO'
      })
      t.equal(logger.messages.fatal[0][0], 'Cannot refresh AWS credentials: AssumeRoleWithWebIdentity failed with HTTP error 400 and body: FOO')
    })
  })

  t.test('s3', async t => {
    const region = 'the-region'
    const bucket = 'the-bucket'
    const key = 'the-key'

    t.test('s3Url', async t => {
      t.test('should compose the s3 url', async t => {
        const client = new Client({ dynamoOptions: { region: 'dynamo-region' } })
        t.equal(client.s3Url('the-region', 'the-bucket', '/the-key'), 'https://the-bucket.s3.the-region.amazonaws.com/the-key')
      })
    })

    t.test('s3Fetch', async t => {
      t.test('should fetch from s3', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.s3Url(region, bucket))
          .intercept({ method: 'GET', path: key })
          .reply(200, 'binary-content')

        t.equal((await client.s3Fetch({ region, bucket, key })).toString('utf8'), 'binary-content')
      })

      t.test('should fetch from s3 with offset and length', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.s3Url(region, bucket))
          .intercept({ method: 'GET', path: key, headers: { range: 'bytes=1-5' } })
          .reply(200, 'binary-content')

        t.equal((await client.s3Fetch({ region, bucket, key, offset: 1, length: 5 })).toString('utf8'), 'binary-content')
      })

      t.test('should fetch from s3 with length only', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.s3Url(region, bucket))
          .intercept({ method: 'GET', path: key, headers: { range: 'bytes=0-4' } })
          .reply(200, 'binary-content')

        t.equal((await client.s3Fetch({ region, bucket, key, length: 5 })).toString('utf8'), 'binary-content')
      })

      t.test('should retry fetching from s3 and eventually succeed', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        let attempt = 0
        const client = new Client(options)
        client.agent
          .get(client.s3Url(region, bucket))
          .intercept({ method: 'GET', path: key })
          .reply(() => {
            if (++attempt === 3) {
              return { statusCode: 200, data: 'binary-content' }
            }
            return { statusCode: 400 }
          })
          .times(3)

        t.equal((await client.s3Fetch({ region, bucket, key, retries: 3, retryDelay: 10 })).toString('utf8'), 'binary-content')
        t.equal(logger.messages.debug[0][0], 'S3 Error, URL: https://the-bucket.s3.the-region.amazonaws.com/the-key Error: "S3 request error - Status: 400 Body:  " attempt 1 / 3')
        t.equal(logger.messages.debug[1][0], 'S3 Error, URL: https://the-bucket.s3.the-region.amazonaws.com/the-key Error: "S3 request error - Status: 400 Body:  " attempt 2 / 3')
        t.equal(logger.messages.debug.length, 2)
        t.equal(logger.messages.error.length, 0)
      })

      t.test('should handle the "not found" error fetching from s3', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.s3Url(region, bucket))
          .intercept({ method: 'GET', path: key })
          .reply(404, 'NotFound')

        await t.rejects(() => client.s3Fetch({ region, bucket, key }), { message: 'NOT_FOUND' })
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 1)
        t.equal(logger.messages.error[0][1], 'S3 Not Found')
      })

      t.test('should get error with negative length', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        const empty = await client.s3Fetch({ region, bucket, key, length: -1 })

        t.ok(Buffer.isBuffer(empty))
        t.equal(empty.length, 0)
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 0)
        t.same(logger.messages.warn[0], [{ key }, 'Called s3Fetch with length 0'])
      })
    })

    t.test('s3HeadBucket', async t => {
      t.test('should get bucket presence on HeadBucket command', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.s3Url(region, bucket))
          .intercept({ method: 'GET', path: '/' })
          .reply(200, 'ok')

        await client.s3HeadBucket({ region, bucket })
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 0)
      })

      t.test('should handle error on HeadBucket command', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.s3Url(region, bucket))
          .intercept({ method: 'GET', path: key })
          .reply(400, 'Error')

        await t.rejects(() => client.s3HeadBucket({ region, bucket }), { message: 's3.headBucket' })
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 1)
        t.equal(logger.messages.error[0][1], 'Cannot s3.headBucket')
      })
    })
  })

  t.test('dynamo', async t => {
    t.test('dynamoQueryBySortKey', async t => {
      t.test('should query dynamo', async t => {
        const records = [{ a: 'b' }]
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(200, { Items: records.map(r => marshall(r)) })

        t.same((await client.dynamoQueryBySortKey({ table: 'table', keyName: 'key', keyValue: 'id' })), records)
      })

      t.test('should retry querying dynamo and eventually succeed', async t => {
        const records = [{ a: 'b' }]
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        let attempt = 0
        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(() => {
            if (++attempt === 3) {
              return { statusCode: 200, data: { Items: records.map(r => marshall(r)) } }
            }
            return { statusCode: 400 }
          })
          .times(3)

        t.same((await client.dynamoQueryBySortKey({ table: 'table', keyName: 'key', keyValue: 'id', retries: 3, retryDelay: 10 })), records)
        t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.Query attempt 1 / 3')
        t.equal(logger.messages.debug[1][1], 'Cannot Dynamo.Query attempt 2 / 3')
        t.equal(logger.messages.debug.length, 2)
        t.equal(logger.messages.error.length, 0)
      })

      t.test('should handle empty result', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(200, { Items: [] })

        t.same((await client.dynamoQueryBySortKey({ table: 'table', keyName: 'key', keyValue: 'id' })), [])
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 0)
      })

      t.test('should handle error querying dynamo', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'GET', path: '/' })
          .reply(400, 'ThrottlingError')

        await t.rejects(() => client.dynamoQueryBySortKey({ table: 'table', keyName: 'key', keyValue: 'id', retries: 5, retryDelay: 10 }), { message: 'Dynamo.Query' })
        t.equal(logger.messages.debug.length, 5)
        t.equal(logger.messages.error.length, 1)
        t.equal(logger.messages.error[0][1], 'Cannot Dynamo.Query after 5 attempts')
      })
    })

    t.test('dynamoGetItem', async t => {
      t.test('should query dynamo', async t => {
        const record = { a: 'b' }
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(200, { Item: marshall(record) })

        t.same((await client.dynamoGetItem({ table: 'table', keyName: 'key', keyValue: 'id' })), record)
      })

      t.test('should retry querying dynamo and eventually succeed', async t => {
        const record = { a: 'b' }
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        let attempt = 0
        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(() => {
            if (++attempt === 3) {
              return { statusCode: 200, data: { Item: marshall(record) } }
            }
            return { statusCode: 400 }
          })
          .times(3)

        t.same((await client.dynamoGetItem({ table: 'table', keyName: 'key', keyValue: 'id', retries: 3, retryDelay: 10 })), record)
        t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.GetItem attempt 1 / 3')
        t.equal(logger.messages.debug[1][1], 'Cannot Dynamo.GetItem attempt 2 / 3')
        t.equal(logger.messages.debug.length, 2)
        t.equal(logger.messages.error.length, 0)
      })

      t.test('should handle empty result', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(200, { Item: null })

        t.same((await client.dynamoGetItem({ table: 'table', keyName: 'key', keyValue: 'id' })), undefined)
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 0)
      })

      t.test('should handle error querying dynamo', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'GET', path: '/' })
          .reply(400, 'ThrottlingError')

        await t.rejects(() => client.dynamoGetItem({ table: 'table', keyName: 'key', keyValue: 'id', retries: 5, retryDelay: 10 }),
          { message: 'Dynamo.GetItem' })
        t.equal(logger.messages.debug.length, 5)
        t.equal(logger.messages.error.length, 1)
        t.equal(logger.messages.error[0][1], 'Cannot Dynamo.GetItem after 5 attempts')
      })
    })

    t.test('dynamoDescribeTable', async t => {
      t.test('should get table info on DescribeTable command', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(200, { Table: 'table' })

        await client.dynamoDescribeTable('table')
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 0)
      })

      t.test('should handle error on DescribeTable command', async t => {
        const logger = helper.spyLogger()
        const options = awsClientOptions(config, logger)
        options.agent = createMockAgent()

        const client = new Client(options)
        client.agent
          .get(client.dynamoUrl)
          .intercept({ method: 'POST', path: '/' })
          .reply(400, 'Error')

        await t.rejects(() => client.dynamoDescribeTable('table'), { message: 'Dynamo.DescribeTable' })
        t.equal(logger.messages.debug.length, 0)
        t.equal(logger.messages.error.length, 1)
        t.equal(logger.messages.error[0][1], 'Cannot Dynamo.DescribeTable')
      })
    })
  })
})

t.test('awsClientOptions', async t => {
  const config = {
    awsClientConnectTimeout: 987,
    awsClientKeepAliveTimeout: 123,
    awsClientConcurrency: 456,
    awsClientPipelining: 789,

    s3MaxRetries: 1,
    s3RetryDelay: 3,
    dynamoRegion: 'dynamo-region',
    dynamoMaxRetries: 2,
    dynamoRetryDelay: 4,
    awsClientRefreshCredentialsInterval: 10e3,
    awsRoleSessionName: 'the-bitswap'
  }
  const logger = 'the-logger'

  t.same(awsClientOptions(config, logger), {
    awsAgentOptions: {
      connect: { timeout: 987 },
      keepAliveTimeout: 123,
      connections: 456,
      pipelining: 789
    },
    refreshCredentialsInterval: 10000,
    s3Options: {
      maxRetries: 1,
      retryDelay: 3
    },
    dynamoOptions: {
      region: 'dynamo-region',
      maxRetries: 2,
      retryDelay: 4
    },
    roleSessionName: 'the-bitswap',
    logger: 'the-logger'
  })
})
