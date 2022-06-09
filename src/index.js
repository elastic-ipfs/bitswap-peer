'use strict'

require('make-promises-safe')

const { telemetryPort } = require('./config')
const { logger } = require('./logging')
const { startService } = require('./service')
const { ensureAwsCredentials } = require('./storage')
const { telemetry } = require('./telemetry')

async function boot() {
  try {
    await ensureAwsCredentials()
    await telemetry.startServer(telemetryPort)

    process.nextTick(startService)
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

boot()
