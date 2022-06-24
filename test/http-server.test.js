'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { httpPort } = require('../src/config')
const { get } = require('http')

/** @type {import('http').Server} */
let _server

t.before(async () => {
  const successReadinessMock = () => Promise.resolve(200)
  _server = await startServer(successReadinessMock, httpPort)
})

async function startServer(readinessFunction, port) {
  /** @type {import('../src/http-server')} */
  const httpServerModuleWithMocks = await t.mock('../src/http-server.js', {
    /** @type {import('../src/health-check.js')} */
    '../src/health-check.js': {
      healthCheck: {
        checkReadiness: readinessFunction
      }
    },
    /** @type {import('../src/telemetry.js')} */
    '../src/telemetry.js': {
      telemetry: {
        export: () => 'Works'
      }
    }
  })
  return await httpServerModuleWithMocks.httpServer.startServer(port)
}

t.test('httpServer - Server starts with default http port', async t => {
  t.equal(_server?.address()?.port, parseInt(httpPort))
  t.end()
})

t.test('httpServer - liveness returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/liveness', _server)
  t.equal(res.statusCode, 200)
})

t.test('httpServer - metrics returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/metrics', _server)
  t.equal(res.statusCode, 200)
})

t.test('httpServer - readiness returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/readiness', _server)
  t.equal(res.statusCode, 200)
})

t.test('httpServer - not found path returns 404', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/thisPathDoesNotExist', _server)
  t.equal(res.statusCode, 404)
})

t.test('httpServer - error in readiness returns 500', async t => {
  const errorReadinessMock = () => Promise.reject(new Error('Something bad happened'))
  const errorReadinessServer = await startServer(errorReadinessMock, Number(httpPort) + 1)
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/readiness', errorReadinessServer)
  errorReadinessServer?.close()
  t.equal(res.statusCode, 500)
})

function doHttpRequest(path, server) {
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

t.teardown(async () => {
  _server?.close()
})
