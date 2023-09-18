
import { createServer } from 'node:http'
import { URL } from 'node:url'
import { logger } from './logging.js'
import { checkReadiness } from './health-check.js'
import { setReadiness } from './storage.js'
import { telemetry } from './telemetry.js'
import { version } from './util.js'

class HttpServer {
  startServer ({ port, awsClient, readinessConfig, allowReadinessTweak }) {
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
          checkReadiness({ awsClient, readinessConfig, allowReadinessTweak, logger })
            .then(httpStatus => {
              res.writeHead(httpStatus).end()
            })
          break
        }
        case '/readiness/tweak': {
          if (!allowReadinessTweak) {
            res.writeHead(404).end()
            break
          }
          try {
            const dynamo = url.searchParams.get('dynamo')
            const s3 = url.searchParams.get('s3')
            setReadiness({
              dynamo: dynamo ? dynamo === 'true' : undefined,
              s3: s3 ? s3 === 'true' : undefined
            })
            res.writeHead(200).end()
          } catch {
            res.writeHead(400).end()
          }
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
          })
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
