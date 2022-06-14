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

function doHttpRequest(path) {
  return new Promise((resolve, reject) => {
    const req = get({
      hostname: server?.address()?.address,
      port: server?.address()?.port,
      path: path
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
}

t.before(async () => {
  server = await healthCheck.startServer(healthCheckPort)
})

t.test('healthcheck - Server starts with default port', async t => {
  t.equal(server?.address()?.port, parseInt(healthCheckPort))
})

t.test('healthcheck - liveness returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/liveness')
  t.equal(res.statusCode, 200)
})

t.test('healthcheck - not found path returns 404', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/thisPathDoesNotExist')
  t.equal(res.statusCode, 404)
})

t.teardown(() => {
  server?.close()
})
