
import { serializeError } from './logging.js'

const READINESS_SUCCESS_CODE = 200
const READINESS_FAIL_CODE = 503

// @see README#readiness

let timer
let working
async function checkReadiness ({ reset, resetting = 600, timeout = 5, awsClient, readiness, logger }) {
  return new Promise(resolve => {
    let resolved

    if (reset || !working) {
      timer && clearInterval(timer)
      working = false
    }

    if (!timer) {
      timer = setInterval(() => { working = false }, resetting * 1000).unref()
    }

    if (working) {
      setTimeout(() => {
        if (resolved) { return }
        logger.info('Readiness Timeout, assuming it is working')

        resolved = true
        resolve(READINESS_SUCCESS_CODE)
      }, timeout * 1000).unref()
    }

    send({ awsClient, readiness })
      .then(() => {
        if (resolved) { return }
        working = true
        resolved = true
        resolve(READINESS_SUCCESS_CODE)
      })
      .catch(err => {
        logger.error({ err: serializeError(err) }, 'Readiness Probe Failed')
        // force reset next time
        working = false
        if (resolved) { return }
        resolved = true
        resolve(READINESS_FAIL_CODE)
      })
  })
}

function send ({ awsClient, readiness }) {
  return Promise.all([
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
}

export function reset () {
  timer && clearInterval(timer)
  working = false
}

export { checkReadiness }
