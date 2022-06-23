'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { httpPort } = require('../src/config')
const { get } = require('http')

/** @type {import('http').Server} */
let server

t.before(async () => {
  /** @type {import('../src/http-server')} */
  const httpServerModuleWithMocks = await t.mock('../src/http-server.js', {
    /** @type {import('../src/health-check.js')} */
    '../src/health-check.js': {
      healthCheck: {
        checkReadiness: () => Promise.resolve(200)
      }
    }
  })

  server = await httpServerModuleWithMocks.httpServer.startServer(httpPort)
})

t.test('httpServer - Server starts with default http port', async t => {
  t.equal(server?.address()?.port, parseInt(httpPort))
})

t.test('httpServer - liveness returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/liveness')
  t.equal(res.statusCode, 200)
})

t.test('httpServer - readiness returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/readiness')
  t.equal(res.statusCode, 200)
})

t.test('httpServer - metrics returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/metrics')
  t.equal(res.statusCode, 200)
})
/** */

t.test('httpServer - not found path returns 404', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/thisPathDoesNotExist')
  t.equal(res.statusCode, 404)
})

function doHttpRequest(path) {
  return new Promise((resolve, reject) => {
    const req = get({
      hostname: server?.address()?.address,
      port: server?.address()?.port,
      path: path
    })

    req.on('response', res => {
      resolve(res)
    })

    req.on('error', err => {
      console.log('http request error')
      reject(err)
    })
  })
}

t.teardown(() => {
  server?.close()
})
