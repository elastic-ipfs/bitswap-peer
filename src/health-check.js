'use strict'

const { logger, serializeError } = require('./logging')
const { getPeerId } = require('./peer-id')
const { searchCarInDynamoV1 } = require('./storage')

class HealthCheck {
  async checkReadiness() {
    try {
      await getPeerId()
      await searchCarInDynamoV1({ blockKey: 'nonExistentKey', logger })
      return 200
    } catch (err) {
      const errMessage = `Readiness Probe Failed. Error: ${serializeError(err)}`
      logger.error({ err }, errMessage)
      return 503
    }
  }
}

module.exports = { healthCheck: new HealthCheck() }
