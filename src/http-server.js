
import { createServer } from 'http'
import config from './config.js'
import { logger } from './logging.js'
import { checkReadiness } from './health-check.js'
import { telemetry } from './telemetry.js'
import inspect from './inspect/index.js'
import { version } from './util.js'

const checkReadinessRates = [
  config.readinessDynamoCheckRate,
  config.readinessS3CheckRate
]

class HttpServer {
  startServer ({ port, awsClient, readiness }) {
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
          checkReadiness({ rates: checkReadinessRates, awsClient, readiness, logger })
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
        case '/inspect/start': {
          if (!config.allowInspection) {
            res.writeHead(404).end()
            break
          }
          inspect.start()
          res.writeHead(200, {
            connection: 'close',
            'content-type': 'text/plain'
          }).end('ok')
          break
        }
        case '/inspect/stop': {
          if (!config.allowInspection) {
            res.writeHead(404).end()
            break
          }
          inspect.stop()
          res.writeHead(200, {
            connection: 'close',
            'content-type': 'application/json'
          }).end('ok')
          break
        }
        case '/inspect/chart': {
          if (!config.allowInspection) {
            res.writeHead(404).end()
            break
          }
          res.writeHead(200, {
            connection: 'close',
            'content-type': 'text/html'
          })
          inspect.chart().then(chart => res.end(chart))
          break
        }
        case '/inspect/gc': {
          if (!config.allowInspection) {
            res.writeHead(404).end()
            break
          }
          if (global.gc()) {
            res.writeHead(200).end()
          } else {
            res.writeHead(200).end('no gc, use --expose-gc flag')
          }
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
}

const httpServer = new HttpServer()

export { httpServer }
