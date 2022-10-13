'use strict'

const { serializeError } = require('./logging')

async function checkReadiness({ awsClient, readiness, logger }) {
  try {
    await Promise.all([
      awsClient.dynamoQueryBySortKey({
        table: readiness.dynamo.table,
        keyName: readiness.dynamo.keyName,
        keyValue: readiness.dynamo.keyValue
      }),
      awsClient.s3Fetch({
        region: readiness.s3.region,
        bucket: readiness.s3.bucket,
        key: readiness.s3.key
      })
    ])
    return 200
  } catch (err) {
    logger.error({ err: serializeError(err) }, 'Readiness Probe Failed')
    return 503
  }
}

module.exports = { checkReadiness }
