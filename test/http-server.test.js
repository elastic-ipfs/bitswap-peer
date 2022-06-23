'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { httpPort } = require('../src/config')
const { get } = require('http')

/** @type {import('http').Server} */
let _server
let _errorReadinessServer

t.test('httpServer - Happy path through working server', async t => {
  const successReadinessMock = () => Promise.resolve(200)
  const errorReadinessMock = () => Promise.reject(new Error('Something bad happened'))
  _server = await startServer(successReadinessMock, httpPort)
  _errorReadinessServer = await startServer(errorReadinessMock, Number(httpPort) + 1)
  t.equal(_server?.address()?.port, parseInt(httpPort))
  const res = await doHttpRequest('/readiness', _errorReadinessServer)
  t.equal(res.statusCode, 500)
  // t.equal(1, 1)
  // server?.close()
  // errorReadinessServer?.close()
})

t.teardown(async t => {
  _server?.close()
  _errorReadinessServer?.close()
  console.log('******** hit end of teardown!')
})

// t.before(async () => {
//   const successReadinessMock = () => Promise.resolve(200)
//   const errorReadinessMock = () => Promise.reject(new Error('Something bad happened'))
//   _server = await startServer(successReadinessMock, httpPort)
//   _errorReadinessServer = await startServer(successReadinessMock, Number(httpPort) + 1)
//   t.end()
//   // server?.close()
//   // errorReadinessServer?.close()
// })

// t.test('httpServer - Server starts with default http port', async t => {
//   t.equal(_server?.address()?.port, parseInt(httpPort))
//   t.end()
// })

// // t.test('httpServer - liveness returns 200', async t => {
// //   /** @type {import('http').ServerResponse} */
// //   const res = await doHttpRequest('/liveness')
// //   t.equal(res.statusCode, 200)
// // })

// // t.test('httpServer - metrics returns 200', async t => {
// //   /** @type {import('http').ServerResponse} */
// //   const res = await doHttpRequest('/metrics')
// //   t.equal(res.statusCode, 200)
// // })

// // t.test('httpServer - readiness returns 200', async t => {
// //   /** @type {import('http').ServerResponse} */
// //   const res = await doHttpRequest('/readiness')
// //   t.equal(res.statusCode, 200)
// // })

// // t.test('httpServer - not found path returns 404', async t => {
// //   /** @type {import('http').ServerResponse} */
// //   const res = await doHttpRequest('/thisPathDoesNotExist')
// //   t.equal(res.statusCode, 404)
// // })

// t.test('httpServer - error in readiness returns 500', async t => {
//   /** @type {import('http').ServerResponse} */
//   const res = await doHttpRequest('/readiness', _errorReadinessServer)
//   t.equal(res.statusCode, 500)
// })

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
