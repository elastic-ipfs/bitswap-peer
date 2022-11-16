
import t from 'tap'

import { sleep } from '../src/util.js'
import { checkReadiness, reset } from '../src/health-check.js'
import * as helper from './utils/helper.js'

t.test('checkReadiness', async t => {
  const readiness = {
    dynamo: { table: 'dynamo-table' },
    s3: { region: 's3-region', bucket: 's3-bucket' }
  }

  t.teardown(() => {
    reset()
  })

  t.test('should return 200 when it\'s all good, man', async t => {
    const awsClient = {
      dynamoQueryBySortKey: async () => { },
      s3Fetch: async () => { }
    }
    const logger = helper.dummyLogger()

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger }), 200)
  })

  t.test('should return 200 the second time, without responding by timeout', async t => {
    const timeout = 0.5
    const awsClient = {
      dynamoQueryBySortKey: async () => { },
      s3Fetch: async () => { }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger, timeout }), 200)
    t.equal(await checkReadiness({ awsClient, readiness, logger, timeout }), 200)
    t.equal(logger.messages.info.length, 0)
  })

  t.test('should return 200 the second time, before waiting for the aws response', async t => {
    const timeout = 0.5
    const awsClient = {
      dynamoQueryBySortKey: async () => { await sleep(timeout * 1000) },
      s3Fetch: async () => { await sleep(timeout * 1000) }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger, timeout }), 200)
    t.equal(await checkReadiness({ awsClient, readiness, logger, timeout }), 200)
    t.equal(logger.messages.info.length, 1)
    t.equal(logger.messages.info[0][0], 'Readiness Timeout, assuming it is working')
  })

  t.test('should return 200, but since the query failed, status will be reset - response is longer than timeout', async t => {
    const timeout = 0.5
    let times = 0
    const awsClient = {
      dynamoQueryBySortKey: async () => { await sleep(timeout * 1000) },
      s3Fetch: async () => {
        await sleep(timeout * 1000)
        if (times > 0 && times < 3) {
          throw new Error('ERROR_ON_S3')
        }
      }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger, timeout }), 200)
    times++
    t.equal(await checkReadiness({ awsClient, readiness, logger, timeout }), 200)
    times++
    t.equal(await checkReadiness({ awsClient, readiness, logger, timeout }), 200)
    times++
    t.equal(await checkReadiness({ awsClient, readiness, logger, timeout }), 200)
    times++
    t.equal(logger.messages.info.length, 2)
    t.equal(logger.messages.error.length, 1)
  })

  t.test('should return 200, but since the query failed, status will be reset - response is faster than timeout', async t => {
    const timeout = 0.5
    let times = 0
    const awsClient = {
      dynamoQueryBySortKey: async () => { await sleep(2 * timeout * 1000) },
      s3Fetch: async () => {
        if (times === 1) { throw new Error('ERROR_ON_S3') }
      }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger, timeout }), 200)
    times++
    t.equal(await checkReadiness({ awsClient, readiness, logger, timeout }), 503)
    times++
    t.equal(await checkReadiness({ awsClient, readiness, logger, timeout }), 200)
    times++
    t.equal(logger.messages.info.length, 0)
    t.equal(logger.messages.error.length, 1)
  })

  t.test('should return 503 on Dynamo error', async t => {
    const awsClient = {
      dynamoQueryBySortKey: async () => { throw new Error('ERROR_ON_DYNAMO') },
      s3Fetch: async () => { }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger }), 503)
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

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger }), 503)
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

    t.equal(await checkReadiness({ reset: true, awsClient, readiness, logger }), 503)
    t.equal(logger.messages.error.length, 1)
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_DYNAMO')
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
  })
})
