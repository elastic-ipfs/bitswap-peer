'use strict'

process.env.ENV_FILE_PATH = '/dev/null'
process.env.LOG_LEVEL = 'error'
process.env.NODE_DEBUG = 'aws-ipfs-bitswap-peer'
process.env.PEER_ID_S3_BUCKET = 'idBucket'
process.env.NOW = 'now'

const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { readFile } = require('fs/promises')
const { get } = require('http')
const { resolve } = require('path')
const { createFromJSON } = require('peer-id')
const { Readable } = require('stream')
const t = require('tap')
const { getPeerId, concurrency, blocksTable, carsTable, port, telemetryPort } = require('../src/config')
const { logger, serializeError } = require('../src/logging')
const telemetry = require('../src/telemetry')
const { s3Mock } = require('./utils/mock')

t.test('config - download the peerId from S3', async t => {
  t.plan(3)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from(rawPeer) }
  })

  t.equal((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - creates a new PeerId if download fails', async t => {
  t.plan(3)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from('INVALID', 'utf-8') }
  })

  t.not((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - it exports reasonable defaults', t => {
  t.plan(5)

  t.equal(concurrency, 16)
  t.equal(blocksTable, 'blocks')
  t.equal(carsTable, 'cars')
  t.equal(port, 3000)
  t.equal(telemetryPort, 3001)
})

t.test('logging - an error is properly serialized', t => {
  t.plan(2)

  const errorWithCode = new Error('FAILED')
  errorWithCode.code = 'CODE'

  const error = new Error('FAILED')

  t.equal(serializeError(error), '[Error] FAILED')
  t.equal(serializeError(errorWithCode), '[CODE] FAILED')
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
    info(arg) {}
  }

  const server = await telemetry.startServer(0)
  const server2 = await telemetry.startServer(0)
  t.equal(server.address().port, server2.address().port)

  const metricsUrl = `http://localhost:${server.address().port}/metrics`

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
c3_durations_bucket{le="1"} 3 now
c3_durations_bucket{le="10"} 3 now
c3_durations_bucket{le="25"} 3 now
c3_durations_bucket{le="50"} 3 now
c3_durations_bucket{le="75"} 3 now
c3_durations_bucket{le="90"} 3 now
c3_durations_bucket{le="99"} 3 now
c3_durations_bucket{le="0.001"} 3 now
c3_durations_bucket{le="0.01"} 3 now
c3_durations_bucket{le="0.1"} 3 now
c3_durations_bucket{le="2.5"} 3 now
c3_durations_bucket{le="97.5"} 3 now
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
