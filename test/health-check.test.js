
import t from 'tap'

import { checkReadiness, reset } from '../src/health-check.js'
import * as helper from './utils/helper.js'

t.test('checkReadiness', async t => {
  const readiness = {
    dynamo: { table: 'dynamo-table' },
    s3: { region: 's3-region', bucket: 's3-bucket' }
  }

  t.test('should return 200 when it\'s all good, man', async t => {
    reset()
    const awsClient = {
      dynamoQueryBySortKey: async () => { },
      s3Fetch: async () => { }
    }
    const logger = helper.dummyLogger()

    t.equal(await checkReadiness({ awsClient, readiness, logger }), 200)
  })

  t.test('should return 503 on Dynamo error', async t => {
    reset()
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
    reset()
    const awsClient = {
      dynamoQueryBySortKey: async () => { },
      s3Fetch: async () => { throw new Error('ERROR_ON_S3') }
    }
    const logger = helper.spyLogger()

    t.equal(await checkReadiness({ awsClient, readiness, logger }), 200)
    t.equal(await checkReadiness({ awsClient, readiness, logger }), 503)
    t.equal(logger.messages.error.length, 1)
    t.match(logger.messages.error[0][0].err, 'ERROR_ON_S3')
    t.equal(logger.messages.error[0][1], 'Readiness Probe Failed')
  })

  t.test('should do sampling, without failures', async t => {
    reset()
    let dynamoCalls = 0
    let s3Calls = 0
    const awsClient = {
      dynamoQueryBySortKey: async () => { dynamoCalls++ },
      s3Fetch: async () => { s3Calls++ }
    }
    const logger = helper.dummyLogger()
    const samplings = [10, 10]

    for (let i = 0; i < 100; i++) {
      t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200)
    }
    t.equal(dynamoCalls, 5)
    t.equal(s3Calls, 5)
  })

  t.test('should do sampling, resetting on failures', async t => {
    reset()
    let dynamoCalls = 0
    let s3Calls = 0
    const awsClient = {
      dynamoQueryBySortKey: async () => {
        dynamoCalls++
        if (dynamoCalls === 2) {
          throw new Error('ERROR_ON_DYNAMO')
        }
      },
      s3Fetch: async () => {
        s3Calls++
        if (s3Calls === 3) {
          throw new Error('ERROR_ON_S3')
        }
      }
    }
    const logger = helper.dummyLogger()
    const samplings = [3, 5]

    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#1')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#2')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#3')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#4')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#5')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#6')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 503, '#7', 'should get error on s3')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#8')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#9')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#10')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#11')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#12')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#13')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#14')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#15')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#16')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#17')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#18')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 503, '#19', 'should get error on s3')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#20')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#21')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#22')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#23')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#24')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#25')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#26')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#27')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#28')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#29')
    t.equal(await checkReadiness({ awsClient, readiness, samplings, logger }), 200, '#30')

    t.equal(dynamoCalls, 6)
    t.equal(s3Calls, 4)
  })
})
