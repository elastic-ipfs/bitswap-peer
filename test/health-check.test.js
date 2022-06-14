'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { healthCheckPort } = require('../src/config')
const { healthCheck } = require('../src/health-check')
const { request, Server } = require('http')
const path = require('path')

// const { hasRawBlock, prepare, receiveMessages, teardown } = require('./utils/helpers')
// const { createMockAgent, mockAWS } = require('./utils/mock')

// t.before(() => mockAWS(t))

// DONE: Test Webserver port
// TODO: Test Webserver Routes
// TODO: Test Liveness
// TODO: Test Readiness

// TODO: Start server as beginning and teardown stops server

/** @type {Server} */
let server

t.before(async () => {
  server = await healthCheck.startServer(healthCheckPort)
})

t.test('healthcheck - Server starts with default port', async t => {
  t.equal(server?.address()?.port, parseInt(healthCheckPort))
})

t.test('healthcheck - liveness returns 200', async t => {
  /** @type {Server} */
  const server = await healthCheck.startServer(healthCheckPort)
  console.log('**************')
  console.log(server?.address()?.address)
  // request(server?.address(), {
  //   path: 'readiness'
  // })
  // request({
  //   add
  //   hostname: server?.address()?.host
  //   port: server?.address()?.port
  //   path:
  // })

  t.equal(1, 1)
})

t.teardown(() => {
  server?.close()
})
