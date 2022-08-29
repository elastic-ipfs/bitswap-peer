'use strict'

require('make-promises-safe')

const { httpPort } = require('./config')
const { logger } = require('./logging')
const { startService } = require('./service')
const { httpServer } = require('./http-server')

async function boot() {
  try {
    await httpServer.startServer(httpPort)

    process.nextTick(startService)
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

process.on('uncaughtExceptionMonitor', (err, origin) => {
  logger.fatal({ err, origin }, 'uncaught exception')
})

boot()
