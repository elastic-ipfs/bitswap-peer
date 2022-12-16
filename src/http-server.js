
import { createServer } from 'node:http'
import { URL } from 'node:url'
import { logger } from './logging.js'
import { checkReadiness } from './health-check.js'
import { telemetry } from './telemetry.js'
import { version } from './util.js'

class HttpServer {
  startServer ({ port }) {
    if (this.server) {
      return this.server
    }

    this.server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      switch (url.pathname) {
        case '/liveness':
          res.writeHead(200)
          res.end()
          break
        case '/readiness': {
          checkReadiness({ logger })
            .then(httpStatus => {
              res.writeHead(httpStatus).end()
            })
          break
        }
        case '/load': {
          res.writeHead(200, {
            connection: 'close',
            'content-type': 'application/json'
          })

          const resources = {
            connections: telemetry.getGaugeValue('bitswap-active-connections'),
            pendingRequestBlocks: telemetry.getGaugeValue('bitswap-pending-entries'),
            eventLoopUtilization: telemetry.getGaugeValue('bitswap-elu'),
            // note: duration it's been reset every /metrics call
            responseDuration: telemetry.getHistogramValue('bitswap-request-duration') ?? -1
          }

          res.end(JSON.stringify(resources))
          break
        }
        case '/metrics': {
          res.writeHead(200, {
            connection: 'close',
            'content-type': 'text/plain'
          })
          telemetry.export().then(result => {
            res.end(result)
            telemetry.resetCounters()
            telemetry.resetDurations()
          }
          )
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
        logger.info(`[v${version}] HTTP server started and listening on port ${this.server.address().port} ...`)
        resolve(this.server)
      })
    })
  }

  close () {
    this.server.close()
    this.server = null
  }
}

const httpServer = new HttpServer()

export { httpServer }
