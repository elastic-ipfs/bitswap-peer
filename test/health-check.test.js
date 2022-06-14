'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { healthCheckPort } = require('../src/config')
const { healthCheck } = require('../src/health-check')
// const { hasRawBlock, prepare, receiveMessages, teardown } = require('./utils/helpers')
// const { createMockAgent, mockAWS } = require('./utils/mock')

// t.before(() => mockAWS(t))

// TODO: Test Webserver
// TODO: Test Liveness
// TODO: Test Readiness

t.test('healthcheck - Server starts with default port', async t => {
  const server = await healthCheck.startServer(healthCheckPort)
  t.equal(server?.address()?.port, parseInt(healthCheckPort))
  server?.close()
})
