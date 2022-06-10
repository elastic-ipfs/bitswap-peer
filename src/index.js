'use strict'

require('make-promises-safe')

const { telemetryPort, healthCheckPort } = require('./config')
const { logger } = require('./logging')
const { startService } = require('./service')
const { ensureAwsCredentials } = require('./storage')
const { telemetry } = require('./telemetry')
const { healthCheck } = require('./health-check')

async function boot() {
  try {
    await ensureAwsCredentials()
    await telemetry.startServer(telemetryPort)
    await healthCheck.startServer(healthCheckPort)

    process.nextTick(startService)
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

boot()
