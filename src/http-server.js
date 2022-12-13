
import { createServer } from 'node:http'
import { URL } from 'node:url'
import config from './config.js'
import { logger } from './logging.js'
import { checkReadiness } from './health-check.js'
import { setReadiness } from './storage.js'
import { telemetry } from './telemetry.js'
import inspect from './inspect/index.js'
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

  close () {
    this.server.close()
    this.server = null
  }
}

const httpServer = new HttpServer()

export { httpServer }
