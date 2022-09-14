'use strict'

const { createServer } = require('http')
const { logger } = require('./logging')
const { checkReadiness } = require('./health-check')
const { telemetry } = require('./telemetry')

class HttpServer {
  startServer({ port, awsClient, readiness }) {
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
          checkReadiness({ awsClient, readiness, logger })
            .then(httpStatus => {
              res.writeHead(httpStatus)
              res.end()
            })
          break
        }
        case '/metrics': {
          res.writeHead(200, {
            connection: 'close',
            'content-type': 'text/plain'
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
        if (error) {
          return reject(error)
        }

        logger.info(`HTTP server started and listening on port ${this.server.address().port} ...`)
        resolve(this.server)
      })
    })
  }
}
module.exports = { httpServer: new HttpServer() }
