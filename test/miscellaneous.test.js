'use strict'

process.env.ENV_FILE_PATH = '/dev/null'

process.env.AWS_ACCESS_KEY_ID = 'FOO'
process.env.AWS_REGION = 'us-west-2'
process.env.AWS_SECRET_ACCESS_KEY = 'BAR'
process.env.CONCURRENCY = '128'
process.env.LOG_LEVEL = 'error'
process.env.NODE_DEBUG = 'bitswap-peer'
process.env.NOW = 'now'
process.env.PEER_ID_FILE = 'peerId.json'
process.env.PEER_ID_S3_BUCKET = 'idBucket'
process.env.PIPELINING = '16'
process.env.PORT = '3000'
process.env.HTTP_PORT = '3001'

const { readFile } = require('fs/promises')
const { get } = require('http')
const { resolve } = require('path')
const t = require('tap')

const { concurrency, blocksTable, carsTable, port, httpPort } = require('../src/config')
const { loadEsmModule } = require('../src/esm-loader')
const { logger, serializeError } = require('../src/logging')
const { ensureAwsCredentials } = require('../src/storage')
const signerWorker = require('../src/signer-worker')
const { telemetry } = require('../src/telemetry')
const { httpServer } = require('../src/http-server')
const { getPeerId } = require('../src/peer-id')
const { createMockAgent } = require('./utils/mock')

let createFromJSON
t.before(async () => {
  await ensureAwsCredentials()
  createFromJSON = (await loadEsmModule('@libp2p/peer-id-factory')).createFromJSON
})

t.test('config - download the peerId from S3', async t => {
  t.plan(1)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'), 'utf-8')

  const mockAgent = createMockAgent()

  mockAgent
    .get('https://idbucket.s3.us-west-2.amazonaws.com')
    .intercept({ method: 'GET', path: '/peerId.json' })
    .reply(200, rawPeer)

  t.equal((await getPeerId(mockAgent)).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - creates a new PeerId if download fails', async t => {
  t.plan(1)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))

  const mockAgent = createMockAgent()

  mockAgent
    .get('https://idbucket.s3.us-west-2.amazonaws.com')
    .intercept({ method: 'GET', path: '/peerId.json' })
    .reply(200, 'INVALID')

  t.not((await getPeerId(mockAgent)).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - it exports reasonable defaults', t => {
  t.plan(5)

  t.equal(concurrency, 128)
  t.equal(blocksTable, 'blocks')
  t.equal(carsTable, 'cars')
  t.equal(port, 3000)
  t.equal(httpPort, 3001)
})

t.test('logging - an error is properly serialized', t => {
  t.plan(2)

  const errorWithCode = new Error('FAILED')
  errorWithCode.code = 'CODE'

  const error = new Error('FAILED')

  t.match(serializeError(error), '[Error] FAILED')
  t.match(serializeError(errorWithCode), '[CODE] FAILED')
})

t.test('signer-worker - can handle both session and session-less signing', t => {
  t.plan(2)

  t.notOk(
    signerWorker({
      region: 'us-west-2',
      keyId: 'keyId',
      accessKey: 'accessKey',
      service: 's3',
      method: 'POST',
      url: 'https://bucket.s3.us-west-2.amazonaws.com',
      headers: {}
    })['x-amz-security-token']
  )

  t.ok(
    signerWorker({
      region: 'us-west-2',
      keyId: 'keyId',
      accessKey: 'accessKey',
      sessionToken: 'token',
      service: 's3',
      method: 'POST',
      url: 'https://bucket.s3.us-west-2.amazonaws.com',
      headers: {}
    })['x-amz-security-token']
  )
})

t.test('telemetry - ensure all metrics are defined in YAML file', t => {
  t.plan(1)
  t.throws(() => telemetry.decreaseCount('unknown'), 'Metrics unknown not found.')
})

t.test('telemetry - export', async t => {
  t.plan(13)

  function requestMetrics(url) {
    return new Promise((resolve, reject) => {
      get(url, res => {
        const { statusCode, headers } = res
        let body = ''
        res.setEncoding('utf8')

        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => {
          resolve({ statusCode, headers, body })
        })
      }).on('error', reject)
    })
  }

  telemetry.metrics.clear()
  telemetry.logger = {
    info(arg) { }
  }

  const server = await httpServer.startServer(0)
  const server2 = await httpServer.startServer(0)
  t.equal(server.address().port, server2.address().port)

  const metricsUrl = `http://0.0.0.0:${server.address().port}/metrics`

  {
    const { statusCode, headers, body } = await requestMetrics(metricsUrl)

    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')
    t.equal(headers.connection, 'close')
    t.equal(body, '# no registered metrics')
  }

  telemetry.createMetric('c1', 'COUNTER', 'count')
  telemetry.createMetric('c2-active', 'GAUGE', 'count')
  telemetry.createMetric('c3', 'HISTOGRAM', 'durations')

  {
    const { statusCode, headers, body } = await requestMetrics(metricsUrl)

    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')
    t.equal(headers.connection, 'close')
    t.equal(
      body,
      `
# HELP c2_active_count GAUGE (count)
# TYPE c2_active_count gauge
c2_active_count 0 now
`.trim()
    )
  }

  telemetry.increaseCount('c1', 1)
  telemetry.increaseCount('c2-active', 2)
  telemetry.ensureMetric('c3', 'durations').record(3)

  {
    const { statusCode, headers, body } = await requestMetrics(metricsUrl)

    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')
    t.equal(headers.connection, 'close')
    t.equal(
      body,
      `
# HELP c1_count_total COUNTER (count)
# TYPE c1_count_total counter
c1_count_total 1 now
# HELP c2_active_count GAUGE (count)
# TYPE c2_active_count gauge
c2_active_count 2 now
# HELP c3_durations HISTOGRAM (durations)
# TYPE c3_durations histogram
c3_durations_count 1 now
c3_durations_sum 3 now
c3_durations_bucket{le="0.001"} 3 now
c3_durations_bucket{le="0.01"} 3 now
c3_durations_bucket{le="0.1"} 3 now
c3_durations_bucket{le="1"} 3 now
c3_durations_bucket{le="2.5"} 3 now
c3_durations_bucket{le="10"} 3 now
c3_durations_bucket{le="25"} 3 now
c3_durations_bucket{le="50"} 3 now
c3_durations_bucket{le="75"} 3 now
c3_durations_bucket{le="90"} 3 now
c3_durations_bucket{le="97.5"} 3 now
c3_durations_bucket{le="99"} 3 now
c3_durations_bucket{le="99.9"} 3 now
c3_durations_bucket{le="99.99"} 3 now
c3_durations_bucket{le="99.999"} 3 now
    `.trim()
    )
  }

  // Reset the logger
  server.close()
  telemetry.logger = logger
})
