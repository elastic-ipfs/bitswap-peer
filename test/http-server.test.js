'use strict'

const t = require('tap')

const config = require('../src/config')
const { get } = require('http')

async function startServer(readinessFunction, port) {
  const httpServerModuleWithMocks = await t.mock('../src/http-server.js', {
    '../src/health-check.js': {
      checkReadiness: readinessFunction
    },
    '../src/telemetry.js': {
      telemetry: {
        export: () => 'Works'
      }
    }
  })
  return await httpServerModuleWithMocks.httpServer.startServer({ port })
}

function doHttpRequest(path, server) {
  return new Promise((resolve, reject) => {
    const req = get({
      hostname: server.address().address,
      port: server.address().port,
      path
    })

    req.on('response', res => {
      resolve(res)
    })

    req.on('error', err => {
      reject(err)
    })
  })
}

t.test('httpServer', async t => {
  let server
  t.before(async () => {
    server = await startServer(async () => 200, config.httpPort)
  })

  t.teardown(async () => {
    server.close()
  })

  t.test('should start with default http port', async t => {
    t.equal(server.address().port, config.httpPort)
  })

  t.test('should return 200 on /liveness', async t => {
    /** @type {import('http').ServerResponse} */
    const res = await doHttpRequest('/liveness', server)
    t.equal(res.statusCode, 200)
    // TODO fix assert content
  })

  t.test('should return 200 on /metrics', async t => {
    /** @type {import('http').ServerResponse} */
    const res = await doHttpRequest('/metrics', server)
    t.equal(res.statusCode, 200)
    // TODO fix assert content
  })

  t.test('should return 200 on /readiness', async t => {
    /** @type {import('http').ServerResponse} */
    const res = await doHttpRequest('/readiness', server)
    t.equal(res.statusCode, 200)
    // TODO fix assert content
  })

  t.test('should not found path returns 404', async t => {
    /** @type {import('http').ServerResponse} */
    const res = await doHttpRequest('/thisPathDoesNotExist', server)
    t.equal(res.statusCode, 404)
  })
})

t.test('httpServer - should error in readiness returns 500', async t => {
  const server = await startServer(async () => 503, config.httpPort)

  /** @type {import('http').ServerResponse} */
  const res = await doHttpRequest('/readiness', server)
  t.equal(res.statusCode, 503)
  // TODO fix assert content

  server.close()
})
