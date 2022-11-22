
import { serializeError } from './logging.js'
import { getReadiness, setReadiness } from './storage.js'

const SUCCESS_CODE = 200
const ERROR_CODE = 503

export async function checkReadiness ({ awsClient, readinessConfig, allowReadinessTweak, logger }) {
  const state = getReadiness()

  if (state.s3 && state.dynamo) {
    return SUCCESS_CODE
  }

  if (allowReadinessTweak) {
    // note success is already returned above, with or without allowReadinessTweak
    return ERROR_CODE
  }

  try {
    logger.info('Readiness Probe Check')
    await Promise.all([
      awsClient.dynamoQueryBySortKey({
        table: readinessConfig.dynamo.table,
        keyName: readinessConfig.dynamo.keyName,
        keyValue: readinessConfig.dynamo.keyValue
      }),
      awsClient.s3Fetch({
        region: readinessConfig.s3.region,
        bucket: readinessConfig.s3.bucket,
        key: readinessConfig.s3.key
      })
    ])

    logger.info('Readiness Probe Succeed')
    setReadiness({ s3: true, dynamo: true })
    return SUCCESS_CODE
  } catch (err) {
    logger.error({ err: serializeError(err) }, 'Readiness Probe Failed')
    return ERROR_CODE
  }
}
