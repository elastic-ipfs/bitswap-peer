
import t from 'tap'

import { checkReadiness } from '../src/health-check.js'
import * as helper from './utils/helper.js'

t.test('checkReadiness', async t => {
  const readiness = {
    dynamo: { table: 'dynamo-table' },
    s3: { region: 's3-region', bucket: 's3-bucket' }
  }

  t.test('should return 200 when it\'s all good, man', async t => {
    const awsClient = {
      dynamoQueryBySortKey: async () => { },
      s3Fetch: async () => { }
    }
    const logger = helper.dummyLogger()

    t.equal(await checkReadiness({ awsClient, readiness, logger }), 200)
  })

  t.test('should return 503 on Dynamo error', async t => {
    const awsClient = {
      dynamoQueryBySortKey: async () => { throw new Error('ERROR_ON_DYNAMO') },
      s3Fetch: async () => { }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ awsClient, readiness, logger }), 503)
    t.equal(logger.messages.error.length, 1)
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_DYNAMO')
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
  })

  t.test('should return 503 on S3 error', async t => {
    const awsClient = {
      dynamoQueryBySortKey: async () => { },
      s3Fetch: async () => { throw new Error('ERROR_ON_S3') }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ awsClient, readiness, logger }), 503)
    t.equal(logger.messages.error.length, 1)
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_S3')
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
  })

  t.test('should return 503 on S3 and Dynamo error', async t => {
    const awsClient = {
      dynamoQueryBySortKey: async () => { throw new Error('ERROR_ON_DYNAMO') },
      s3Fetch: async () => { throw new Error('ERROR_ON_S3') }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ awsClient, readiness, logger }), 503)
    t.equal(logger.messages.error.length, 1)
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_DYNAMO')
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
  })
})
