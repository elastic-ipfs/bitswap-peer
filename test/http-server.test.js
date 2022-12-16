
import t from 'tap'
import { get } from 'http'
import { httpServer } from '../src/http-server.js'
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
    const res = await doHttpRequest('/liveness', server)
    t.equal(res.statusCode, 200)
  })

  t.test('should return 200 on /metrics', async t => {
    const res = await doHttpRequest('/metrics', server)
    t.equal(res.statusCode, 200)
    // TODO fix assert content
  })

  t.test('should not found path returns 404', async t => {
    const res = await doHttpRequest('/thisPathDoesNotExist', server)
    t.equal(res.statusCode, 404)
  })

  t.todo('should return 200 on /readiness', async t => {
    const res = await doHttpRequest('/readiness', server)
    t.equal(res.statusCode, 200)
  })

  t.todo('should get readiness error state, returns 503', async t => {
    const res = await doHttpRequest('/readiness', server)
    t.equal(res.statusCode, 503)
  })

  t.test('should get load state', async t => {
    const res = await doHttpRequest('/load', server)

    t.equal(res.statusCode, 200)
  })
})
