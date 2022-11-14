
import pino from 'pino'
import { version } from './util.js'

let level = 'info'

if (process.env.LOG_LEVEL) {
  level = process.env.LOG_LEVEL
} else if (process.env.NODE_DEBUG) {
  level = 'debug'
}

let transport
if (process.env.LOG_PRETTY) {
  transport = {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
}

const logger = pino(
  {
    level,
    base: { v: version },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport
  }
)

function serializeError (e) {
  return `[${e.code || e.constructor.name}] ${e.message}\n${e.stack}`
}

export {
  logger,
  serializeError
}
