'use strict'

const pino = require('pino')
const { version } = require('../package.json')

let destination
let level = 'info'

try {
  if (process.env.NODE_ENV !== 'production') {
    destination = require('pino-pretty')()
  }
} catch (e) {
  // No-op
}

if (process.env.LOG_LEVEL) {
  level = process.env.LOG_LEVEL
} else if (process.env.NODE_DEBUG) {
  level = 'debug'
}

const logger = pino(
  {
    level,
    base: { v: version },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  destination
)

function serializeError(e) {
  return `[${e.code || e.constructor.name}] ${e.message}\n${e.stack}`
}

module.exports = {
  logger,
  serializeError
}
