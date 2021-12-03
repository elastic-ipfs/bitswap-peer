'use strict'

require('make-promises-safe')

const { logger } = require('./logging')
const { startService } = require('./service')

startService().catch(logger.error.bind(logger))
