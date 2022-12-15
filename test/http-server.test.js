
import t from 'tap'
import { get } from 'http'
import { httpServer } from '../src/http-server.js'
import { getReadiness, setReadiness } from '../src/storage.js'
import config from '../src/config.js'
import * as helper from './utils/helper.js'

function doHttpRequest (path, server) {
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
    server = await httpServer.startServer({ port: config.httpPort })
  })

  t.teardown(async () => {
    httpServer.close()
  })

  t.test('should start with default http port', async t => {
    t.equal(server.address().port, config.httpPort)
  })

  t.test('should not start the service twice', async t => {
    const sameServer = await httpServer.startServer({ port: config.httpPort })
    t.same({ hostname: server.address().address, port: server.address().port },
      { hostname: sameServer.address().address, port: sameServer.address().port })
  })

  t.test('should return 200 on /liveness', async t => {
    setReadiness({ s3: true, dynamo: true })

    const res = await doHttpRequest('/liveness', server)
    t.equal(res.statusCode, 200)
  })

  t.test('should return 200 on /metrics', async t => {
    const res = await doHttpRequest('/metrics', server)
    t.equal(res.statusCode, 200)
    // TODO fix assert content
  })

  t.test('should return 200 on /readiness', async t => {
    setReadiness({ s3: true, dynamo: true })

    const res = await doHttpRequest('/readiness', server)
    t.equal(res.statusCode, 200)
  })

  t.test('should not found path returns 404', async t => {
    setReadiness({ s3: true, dynamo: true })

    const res = await doHttpRequest('/thisPathDoesNotExist', server)
    t.equal(res.statusCode, 404)
  })

  t.test('should get readiness error state, returns 503', async t => {
    setReadiness({ s3: false, dynamo: false })

    const res = await doHttpRequest('/readiness', server)
    t.equal(res.statusCode, 503)
  })

  t.test('should get not found accessing readiness tweak', async t => {
    const res = await doHttpRequest('/readiness/tweak', server)
    t.equal(res.statusCode, 404)
  })

  t.test('should get load state', async t => {
    const res = await doHttpRequest('/load', server)

    t.equal(res.statusCode, 200)
  })
})

t.test('httpServer with readiness tweak', async t => {
  let server
  t.before(async () => {
    server = await httpServer.startServer({
      port: await helper.getFreePort(),
      allowReadinessTweak: true
    })
  })

  t.teardown(async () => {
    httpServer.close()
  })

  t.test('should access to /readiness/tweak', async t => {
    const res = await doHttpRequest('/readiness/tweak', server)
    t.equal(res.statusCode, 200)
  })

  t.test('should access to /readiness/tweak setting dynamo', async t => {
    setReadiness({ s3: true, dynamo: true })

    const res = await doHttpRequest('/readiness/tweak?dynamo=false', server)

    t.equal(res.statusCode, 200)
    t.same(getReadiness(), { dynamo: false, s3: true })
  })

  t.test('should access to /readiness/tweak setting dynamo and s3', async t => {
    setReadiness({ s3: true, dynamo: true })

    const res = await doHttpRequest('/readiness/tweak?dynamo=false&s3=false', server)

    t.equal(res.statusCode, 200)
    t.same(getReadiness(), { dynamo: false, s3: false })
  })

  t.test('should set state on /readiness/tweak and get it from /readiness (ok)', async t => {
    await doHttpRequest('/readiness/tweak?dynamo=true&s3=true', server)

    const res = await doHttpRequest('/readiness', server)
    t.equal(res.statusCode, 200)
  })

  t.test('should set state on /readiness/tweak and get it from /readiness (error)', async t => {
    await doHttpRequest('/readiness/tweak?dynamo=false&s3=false', server)

    const res = await doHttpRequest('/readiness', server)
    t.equal(res.statusCode, 503)
  })
})
