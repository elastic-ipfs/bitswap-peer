const { logger, serializeError } = require('./logging')
const { getPeerId } = require('./peer-id')
const { defaultDispatcher, searchCarInDynamo } = require('./storage')
const { blocksTable, primaryKeys } = require('./config')

class HealthCheck {
  async checkReadiness() {
    try {
      await getPeerId()
      await searchCarInDynamo(defaultDispatcher, blocksTable, primaryKeys.blocks, 'nonExistentKey')
      return 200
    } catch (err) {
      const errMessage = `Readiness Probe Failed. Error: ${serializeError(err)}`
      logger.error({ err }, errMessage)
      return 503
    }
  }
}

module.exports = { healthCheck: new HealthCheck() }
