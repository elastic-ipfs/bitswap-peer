'use strict'

process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { fetchBlockFromS3, refreshAwsCredentials, searchCarInDynamo } = require('../src/storage')
const { createMockAgent } = require('./utils/mock')
const bucketRegion = process.env.AWS_REGION

t.test('refreshAwsCredentials - signing', async t => {
  t.plan(3)

  const mockAgent = createMockAgent()
  mockAgent
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

  const { keyId, accessKey, sessionToken } = await refreshAwsCredentials('role', 'identity', mockAgent)
  t.equal(keyId, 'keyId')
  t.equal(accessKey, 'accessKey')
  t.equal(sessionToken, 'sessionToken')
})

t.test('refreshAwsCredentials - error handling', async t => {
  t.plan(1)

  const mockAgent = createMockAgent()
  mockAgent
    .get('https://sts.amazonaws.com')
    .intercept({
      method: 'GET',
      path: '/?Version=2011-06-15&Action=AssumeRoleWithWebIdentity&RoleArn=role&RoleSessionName=bitswap-peer&WebIdentityToken=identity'
    })
    .reply(400, 'FOO')

  await t.rejects(refreshAwsCredentials('role', 'identity', mockAgent), {
    message: 'Cannot refresh AWS credentials: AssumeRoleWithWebIdentity failed with HTTP error 400 and body: FOO'
  })
})

t.test('searchCarInDynamo - HTTP error handling', async t => {
  t.plan(1)

  const mockAgent = createMockAgent()
  mockAgent
    .get('https://dynamodb.us-west-2.amazonaws.com')
    .intercept({
      method: 'POST',
      path: '/',
      body: JSON.stringify({
        TableName: 'table',
        Key: { key: { S: 'error' } },
        ProjectionExpression: 'cars'
      })
    })
    .reply(400, { message: 'FOO' })

  await t.rejects(searchCarInDynamo(mockAgent, 'table', 'key', 'error'), {
    message: 'GetItem failed with HTTP error 400 and body: {"message":"FOO"}'
  })
})

t.test('searchCarInDynamo - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')
  const mockAgent = createMockAgent()
  mockAgent
    .get('https://dynamodb.us-west-2.amazonaws.com')
    .intercept({
      method: 'POST',
      path: '/',
      body: JSON.stringify({
        TableName: 'table',
        Key: { key: { S: 'error' } },
        ProjectionExpression: 'cars'
      })
    })
    .replyWithError(error)

  await t.rejects(searchCarInDynamo(mockAgent, 'table', 'key', 'error'), error)
})

t.test('fetchBlockFromS3 - safety checks', async t => {
  t.plan(2)

  const mockAgent = createMockAgent()
  const empty = await fetchBlockFromS3(mockAgent, bucketRegion, 'bucket', 'key', 12345, 0)
  t.ok(Buffer.isBuffer(empty))
  t.equal(empty.length, 0)
})

t.test('fetchBlockFromS3 - HTTP error handling', async t => {
  t.plan(1)

  const mockAgent = createMockAgent()
  mockAgent
    .get('https://bucket.s3.us-west-2.amazonaws.com')
    .intercept({ method: 'GET', path: '/error' })
    .reply(400, { message: 'FOO' })

  await t.rejects(fetchBlockFromS3(mockAgent, bucketRegion, 'bucket', 'error'), {
    message: 'Fetch failed with HTTP error 400 and body: {"message":"FOO"}'
  })
})

t.test('fetchBlockFromS3 - error handling', async t => {
  t.plan(1)

  const error = new Error('FAILED')

  const mockAgent = createMockAgent()
  mockAgent
    .get('https://bucket.s3.us-west-2.amazonaws.com')
    .intercept({ method: 'GET', path: '/error' })
    .replyWithError(error)

  await t.rejects(fetchBlockFromS3(mockAgent, bucketRegion, 'bucket', 'error'), 'FAILED')
})
