const { createServer } = require('http')
const { logger, serializeError } = require('./logging')
const { getPeerId } = require('../src/peer-id')
const { defaultDispatcher, searchCarInDynamo } = require('./storage')
const { blocksTable, primaryKeys } = require('./config')

class HealthCheck {
  constructor() {
    this.logger = logger
  }

  startServer(port) {
    if (this.server) {
      return this.server
    }

    this.server = createServer(async (req, res) => {
      switch (req.url) {
        case '/liveness':
          res.writeHead(200)
          res.end()
          break
        case '/readiness': {
          const httpStatus = await this.checkReadiness()
          res.writeHead(httpStatus)
          res.end()
          break
        }
        default:
          res.writeHead(404)
          res.end()
      }
    })

    return new Promise((resolve, reject) => {
      this.server.listen(port, '0.0.0.0', error => {
        /* c8 ignore next 3 */
        if (error) {
          return reject(error)
        }

        this.logger.info(`HealthCheck server listening on port ${this.server.address().port} ...`)
        resolve(this.server)
      })
    })
  }

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
