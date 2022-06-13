const { createServer } = require('http')
const { logger } = require('./logging')

class HealthCheck {
  constructor() {
    this.logger = logger
  }

  startServer(port) {
    if (this.server) {
      return this.server
    }

    this.server = createServer((req, res) => {
      switch (req.url) {
        case '/liveness':
          res.writeHead(200)
          res.end()
          break
        case '/readiness':
          res.writeHead(200) // TODO: Just if successful Not always..
          res.end(this.checkReadiness())
          break
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

  checkReadiness() {
    return ''
  }
}

module.exports = { healthCheck: new HealthCheck() }
