'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { healthCheckPort } = require('../src/config')
const { get } = require('http')

/** @type {import('http').Server} */
let server

t.before(async () => {
  /** @type {import('../src/health-check.js')} */
  const healthCheckModuleWithMocks = await t.mock('../src/health-check.js', {
    '../src/peer-id.js': {
      getPeerId: () => 'Works'
    },
    '../src/storage.js': {
      searchCarInDynamo: () => 'Works'
    }
  })

  server = await healthCheckModuleWithMocks.healthCheck.startServer(healthCheckPort)
})

t.test('healthCheck - Server starts with default port', async t => {
  t.equal(server?.address()?.port, parseInt(healthCheckPort))
})

t.test('healthCheck - liveness returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/liveness')
  t.equal(res.statusCode, 200)
})

t.test('healthCheck - readiness returns 200', async t => {
  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/readiness')
  t.equal(res.statusCode, 200)
})

t.test('healthCheck - not found path returns 404', async t => {
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
      console.log('res')
      resolve(res)
    })

    req.on('error', err => {
      console.log('error')
      reject(err)
    })
  })
}

t.teardown(() => {
  server?.close()
})
