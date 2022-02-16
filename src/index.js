'use strict'

require('make-promises-safe')

const { telemetryPort } = require('./config')
const { logger } = require('./logging')
const { startService } = require('./service')
const { startTelemetry } = require('./telemetry')

Promise.all([startService(), startTelemetry(telemetryPort)]).catch(logger.error.bind(logger))
