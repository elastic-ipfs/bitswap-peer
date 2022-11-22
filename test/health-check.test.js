
import t from 'tap'
import { checkReadiness } from '../src/health-check.js'
import { setReadiness } from '../src/storage.js'

import * as helper from './utils/helper.js'

t.test('checkReadiness', async t => {
  const readinessConfig = {
    dynamo: { table: 'dynamo-table' },
    s3: { region: 's3-region', bucket: 's3-bucket' }
  }

  t.test('should return 200 when it\'s all good, man', async t => {
    setReadiness({ s3: true, dynamo: true })
    let dynamoCalls = 0
    let s3Calls = 0
    const awsClient = {
      dynamoQueryBySortKey: async () => { dynamoCalls++ },
      s3Fetch: async () => { s3Calls++ }
    }
    const logger = helper.dummyLogger()

    t.equal(await checkReadiness({ awsClient, readinessConfig, logger }), 200)
    t.equal(dynamoCalls, 0)
    t.equal(s3Calls, 0)
  })

  t.test('should return 503 on S3 error', async t => {
    setReadiness({ s3: true, dynamo: false })
    const awsClient = {
      dynamoQueryBySortKey: async () => { },
      s3Fetch: async () => { throw new Error('ERROR_ON_S3') }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ awsClient, readinessConfig, logger }), 503)
    t.equal(logger.messages.error.length, 1)
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_S3')
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
  })

  t.test('should return 503 on S3 and Dynamo error', async t => {
    setReadiness({ s3: true, dynamo: false })
    const awsClient = {
      dynamoQueryBySortKey: async () => { throw new Error('ERROR_ON_DYNAMO') },
      s3Fetch: async () => { throw new Error('ERROR_ON_S3') }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ awsClient, readinessConfig, logger }), 503)
    t.equal(logger.messages.error.length, 1)
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_DYNAMO')
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
  })

  t.test('should return 503 on Dynamo error', async t => {
    setReadiness({ s3: true, dynamo: false })
    let dynamoCalls = 0
    let s3Calls = 0
    const awsClient = {
      dynamoQueryBySortKey: async () => { dynamoCalls++; throw new Error('ERROR_ON_DYNAMO') },
      s3Fetch: async () => { s3Calls++ }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ awsClient, readinessConfig, logger }), 503)
    t.equal(logger.messages.info.length, 1)
    t.equal(logger.messages.info[0][0], 'Readiness Probe Check')
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_DYNAMO')
    t.equal(logger.messages.error.length, 1)
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
    t.equal(dynamoCalls, 1)
    t.equal(s3Calls, 1)
  })

  t.test('should return 503 on Dynamo error, then call the checks and recover', async t => {
    setReadiness({ s3: true, dynamo: false })
    let dynamoCalls = 0
    let s3Calls = 0
    const awsClient = {
      dynamoQueryBySortKey: async () => {
        dynamoCalls++
        if (dynamoCalls === 1) {
          throw new Error('ERROR_ON_DYNAMO')
        }
      },
      s3Fetch: async () => { s3Calls++ }
    }

    let logger = helper.spyLogger()
    t.equal(await checkReadiness({ awsClient, readinessConfig, logger }), 503)
    t.equal(logger.messages.info.length, 1)
    t.equal(logger.messages.info[0][0], 'Readiness Probe Check')
    t.equal(logger.messages.error.length, 1)
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')

    logger = helper.spyLogger()
    t.equal(await checkReadiness({ awsClient, readinessConfig, logger }), 200)
    t.equal(logger.messages.info.length, 2)
    t.equal(logger.messages.info[0][0], 'Readiness Probe Check')
    t.equal(logger.messages.info[1][0], 'Readiness Probe Succeed')
    t.equal(logger.messages.error.length, 0)

    t.equal(dynamoCalls, 2)
    t.equal(s3Calls, 2)
  })
})
