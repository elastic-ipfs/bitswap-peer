const { createServer } = require('http')
const { logger } = require('./logging')
const { healthCheck } = require('./health-check')
const { telemetry } = require('./telemetry')

class HttpServer {
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
        case '/readiness': {
          const httpStatus = healthCheck
            .checkReadiness()
            .then(httpStatus => {
              res.writeHead(httpStatus)
              res.end()
            })
            .catch(error => {
              this.logger.error({ error }, 'Cannot check readiness.')
              res.writeHead(500)
              res.end()
            })
          res.writeHead(httpStatus)
          res.end()
          break
        }
        case '/metrics': {
          res.writeHead(200, {
            connection: 'close',
            'content-type': 'text/plain',
            'x-ipfs-bitswap-peer-version': this.version
          })
          res.end(telemetry.export())
          break
        }
        default:
          res.writeHead(404)
          res.end()
          break
      }
    })

    return new Promise((resolve, reject) => {
      this.server.listen(port, '0.0.0.0', error => {
        /* c8 ignore next 3 */
        if (error) {
          return reject(error)
        }

        logger.info(`Metrics server and listening on port ${this.server.address().port} ...`)
        resolve(this.server)
      })
    })
  }
}
