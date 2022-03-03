'use strict'

const { readFileSync } = require('fs')
const { createServer } = require('http')
const { join } = require('path')
const { load } = require('js-yaml')
const { build: buildHistogram } = require('hdr-histogram-js')
const { logger } = require('./logging')

const percentiles = [0.001, 0.01, 0.1, 1, 2.5, 10, 25, 50, 75, 90, 97.5, 99, 99.9, 99.99, 99.999]

class Aggregator {
  constructor(category, description, metric) {
    this.tag = `${category}-${metric}`
    this.description = `${description} (${metric})`
    this.exportName = this.tag.replaceAll('-', '_')

    if (category.match(/active|pending/)) {
      this.type = 'gauge'
    } else if (metric === 'durations') {
      this.type = 'histogram'
    } else {
      this.type = 'counter'
      this.exportName += '_total'
    }

    this.sum = 0
    this.histogram = buildHistogram({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 1e9,
      numberOfSignificantValueDigits: 5
    })
  }

  record(value) {
    this.sum += value

    if (this.type === 'histogram') {
      this.histogram.recordValue(value)
    }
  }

  reset() {
    this.sum = 0
    this.histogram.reset()
  }

  current() {
    const { minNonZeroValue: min, maxValue: max, mean, stdDeviation: stdDev, totalCount: count } = this.histogram

    const value = {
      empty: (this.type === 'histogram' && count === 0) || (this.type === 'counter' && this.sum === 0),
      sum: this.sum,
      histogram:
        count > 0
          ? {
              count,
              min,
              max,
              mean,
              stdDev,
              stdError: stdDev / Math.sqrt(count),
              percentiles: percentiles.reduce((accu, percentile) => {
                accu[percentile] = this.histogram.getValueAtPercentile(percentile)
                return accu
              }, {})
            }
          : undefined,
      timestamp: Date.now()
    }

    this.reset()

    return value
  }
}

class Telemetry {
  constructor() {
    const { component, metrics } = load(readFileSync(join(process.cwd(), 'metrics.yml'), 'utf-8'))

    // Setup
    this.component = component
    this.logger = logger

    // Create metrics
    this.metrics = new Map()
    for (const [category, description] of Object.entries(metrics)) {
      this.createMetric(category, description, 'count')
      this.createMetric(category, description, 'durations')
    }
  }

  startServer(port) {
    if (this.server) {
      return this.server
    }

    this.server = createServer((_, res) => {
      res.writeHead(200, { connection: 'close', 'content-type': 'text/plain' })
      res.end(this.export())
    })

    return new Promise((resolve, reject) => {
      this.server.listen(port, '0.0.0.0', error => {
        /* c8 ignore next 3 */
        if (error) {
          return reject(error)
        }

        this.logger.info(`Metrics server and listening on port ${this.server.address().port} ...`)
        resolve(this.server)
      })
    })
  }

  createMetric(category, description, metric) {
    const instance = new Aggregator(category, description, metric)

    this.metrics.set(instance.tag, instance)
  }

  ensureMetric(category, metric) {
    const metricObject = this.metrics.get(`${category}-${metric}`)

    if (!metricObject) {
      throw new Error(`Metric ${category} not found`)
    }

    return metricObject
  }

  export() {
    let output = ''

    for (const metric of this.metrics.values()) {
      const current = metric.current()

      if (current.empty) {
        continue
      }

      output += `# HELP ${metric.exportName} ${metric.description}\n`
      output += `# TYPE ${metric.exportName} ${metric.type}\n`

      /* c8 ignore next */
      const timestamp = process.env.NOW ?? current.timestamp

      if (metric.type === 'histogram') {
        output += `${metric.exportName}_count ${current.histogram.count} ${timestamp}\n`
        output += `${metric.exportName}_sum ${current.sum} ${timestamp}\n`

        for (const [bucket, bucketValue] of Object.entries(current.histogram.percentiles)) {
          output += `${metric.exportName}_bucket{le="${bucket}"} ${bucketValue} ${timestamp}\n`
        }
      } else {
        output += `${metric.exportName} ${current.sum} ${timestamp}\n`
      }
    }

    if (!output) {
      output = '# no registered metrics'
    }

    return output.trim()
  }

  increaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.record(amount)
  }

  decreaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.record(-1 * amount)
  }

  async trackDuration(category, promise) {
    const metric = this.ensureMetric(category, 'durations')
    const startTime = process.hrtime.bigint()

    try {
      return await promise
    } finally {
      metric.record(Number(process.hrtime.bigint() - startTime) / 1e6)
    }
  }
}

module.exports = new Telemetry()
