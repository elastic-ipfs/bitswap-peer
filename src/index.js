'use strict'

require('make-promises-safe')

const { telemetryPort } = require('./config')
const { logger } = require('./logging')
const { startService } = require('./service')
const telemetry = require('./telemetry')

Promise.all([startService(), telemetry.start(telemetryPort)]).catch(logger.error.bind(logger))
