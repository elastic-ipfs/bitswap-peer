'use strict'

process.env.NOW = 'now'

const { get } = require('http')
const t = require('tap')

const { logger } = require('../src/logging')
const { telemetry } = require('../src/telemetry')
const { httpServer } = require('../src/http-server')

t.test('telemetry - ensure all metrics are defined in YAML file', async t => {
  t.throws(() => telemetry.decreaseCount('unknown'), 'Metrics unknown not found.')
})

t.test('telemetry - export', async t => {
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
