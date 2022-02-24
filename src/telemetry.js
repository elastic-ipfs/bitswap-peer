'use strict'

const { readFileSync } = require('fs')
const { join } = require('path')
const { load } = require('js-yaml')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base')

const { logger } = require('./logging')

class Telemetry {
  constructor() {
    const { component, interval, metrics } = load(readFileSync(join(process.cwd(), 'metrics.yml'), 'utf-8'))

    this.component = component
    this.logger = logger
    this.exporter = new PrometheusExporter({ preventServerStart: true })
    this.meter = new MeterProvider({ exporter: this.exporter, interval }).getMeter(component)
    this.metrics = {}
    for (const [category, description] of Object.entries(metrics)) {
      this.createMetric(
        category,
        description,
        'count',
        category.match(/-(active|pending)-/) ? 'createUpDownCounter' : 'createCounter'
      )

      this.createMetric(category, description, 'durations', 'createHistogram')
    }
  }

  increaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.add(amount)
  }

  decreaseCount(category, amount = 1) {
    const metric = this.ensureMetric(category, 'count')
    metric.add(-1 * amount)
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

  /* c8 ignore next 7 */
  async start(port) {
    this.exporter._port = port

    // Start the server
    await this.exporter.startServer()
    this.logger.info(`OpenTelemetry server and listening on port ${port} ...`)
  }

  createMetric(category, description, metric, creator = 'createCounter') {
    const tag = `${category}-${metric}`
    this.metrics[tag] = this.meter[creator](tag, { description: `${description} (${metric})` })
  }

  ensureMetric(category, metric) {
    const metricObject = this.metrics[`${category}-${metric}`]

    if (!metricObject) {
      throw new Error(`Metric ${category} not found`)
    }

    return metricObject
  }
}

module.exports = new Telemetry()
