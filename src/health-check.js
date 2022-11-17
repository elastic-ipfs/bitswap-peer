
import { serializeError } from './logging.js'
import { telemetry } from './telemetry.js'

const RESET_COUNTER = 1e6
const SUCCESS_CODE = 200
const ERROR_CODE = 503

const checks = [
  {
    name: 'dynamo',
    fn: async ({ awsClient, readiness }) => {
      try {
        await awsClient.dynamoQueryBySortKey({
          table: readiness.dynamo.table,
          keyName: readiness.dynamo.keyName,
          keyValue: readiness.dynamo.keyValue
        })
      } catch (err) {
        return err
      }
    },
    counter: 0
  },
  {
    name: 's3',
    fn: async ({ awsClient, readiness }) => {
      try {
        await awsClient.s3Fetch({
          region: readiness.s3.region,
          bucket: readiness.s3.bucket,
          key: readiness.s3.key
        })
      } catch (err) {
        return err
      }
    },
    counter: 0
  }]
const CHECKS_LENGHT = checks.length

let totalCounter = 0
async function checkReadiness ({ awsClient, readiness, samplings = [], logger }) {
  const index = totalCounter % CHECKS_LENGHT
  const check = checks[index]
  const sampling = samplings[index] ?? 1
  let code

  // not checking, skip check - assumes it works
  if (check.counter % sampling === 0) {
    const err = await telemetry.trackDuration(`bitswap-readiness-${check.name}`, check.fn({ awsClient, readiness }))
    if (err) {
      telemetry.increaseCount('bitswap-readiness-error')
      logger.error({ err: serializeError(err), name: check.name }, 'Readiness Probe Failed')
      code = ERROR_CODE
    } else {
      code = SUCCESS_CODE
    }
  } else {
    code = SUCCESS_CODE
  }

  totalCounter++
  check.counter++
  if (totalCounter > RESET_COUNTER || code === ERROR_CODE) {
    reset()
  }

  return code
}

export function reset () {
  totalCounter = 0
  checks.forEach(c => { c.counter = 0 })
}

export { checkReadiness }
