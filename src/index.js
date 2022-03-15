'use strict'

require('make-promises-safe')

const { telemetryPort } = require('./config')
const { logger } = require('./logging')
const { startService } = require('./service')
const { ensureAwsCredentials } = require('./storage')
const telemetry = require('./telemetry')

async function boot() {
  try {
    await ensureAwsCredentials()
    await telemetry.startServer(telemetryPort)
  } catch (error) {
    logger.error(error)
  }
}

boot()
  .then(() => startService())
  .catch(logger.error.bind(logger))
