'use strict'

const { serializeError } = require('./logging')

async function checkReadiness({ awsClient, readiness, logger }) {
  try {
    await Promise.all([
      awsClient.dynamoDescribeTable(readiness.dynamo.table),
      awsClient.s3HeadBucket(readiness.s3)
    ])
    return 200
  } catch (err) {
    logger.error({ err: serializeError(err) }, 'Readiness Probe Failed')
    return 503
  }
}

module.exports = { checkReadiness }
