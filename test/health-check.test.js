'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { healthCheckPort } = require('../src/config')
const { healthCheck } = require('../src/health-check')
const { get } = require('http')

// const { hasRawBlock, prepare, receiveMessages, teardown } = require('./utils/helpers')
// const { createMockAgent, mockAWS } = require('./utils/mock')

// t.before(() => mockAWS(t))

// DONE: Test Webserver port
// TODO: Test Webserver Routes
// TODO: Test Liveness
// TODO: Test Readiness
// DONE: Start server as beginning and teardown stops server

/** @type {import('http').Server} */
let server

t.before(async () => {
  server = await healthCheck.startServer(healthCheckPort)
})

t.test('healthcheck - Server starts with default port', async t => {
  t.equal(server?.address()?.port, parseInt(healthCheckPort))
})

t.test('healthcheck - liveness returns 200', async t => {
  const httpRequestPromise = new Promise((resolve, reject) => {
    const req = get({
      hostname: server?.address()?.address,
      port: server?.address()?.port,
      path: '/liveness'
    })

    req.on('response', res => {
      console.log('res')
      resolve(res)
    })

    req.on('error', err => {
      console.log('error')
      reject(err)
    })
  })

  /** @type {import('http').ServerResponse} */
  const res = await httpRequestPromise
  console.log(res.statusCode)
  t.equal(res.statusCode, 200)
})

t.teardown(() => {
  server?.close()
})
