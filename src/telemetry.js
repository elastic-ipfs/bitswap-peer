'use strict'

const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')

const { logger } = require('./logging')
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base')

const exporter = new PrometheusExporter({ preventServerStart: true })
const meters = {}
const metrics = {}

// Create all the metrics
meters.bitswapMeter = new MeterProvider({ exporter, interval: 1000 }).getMeter('bitswap')
metrics.bitSwapTotalConnections = meters.bitswapMeter.createCounter('bitswap-total-connections', {
  description: 'Total received BitSwap Connections'
})
metrics.bitSwapActiveConnections = meters.bitswapMeter.createUpDownCounter('bitswap-active-connections', {
  description: 'Total active BitSwap Connections'
})
metrics.bitSwapTotalEntries = meters.bitswapMeter.createCounter('bitswap-total-entries', {
  description: 'Total received BitSwap want list entries'
})
metrics.bitSwapPendingEntries = meters.bitswapMeter.createUpDownCounter('bitswap-pending-entries', {
  description: 'Pending BitSwap want list entries'
})
metrics.bitSwapBlockHits = meters.bitswapMeter.createCounter('bitswap-hits', {
  description: 'Total number of BitSwap blocks found'
})
metrics.bitSwapBlockMisses = meters.bitswapMeter.createCounter('bitswap-misses', {
  description: 'Total number of BitSwap blocks not found'
})
metrics.bitSwapSentData = meters.bitswapMeter.createCounter('bitswap-sent-data', {
  description: 'Total number of blocks data sent, in bytes'
})

meters.dynamoMeter = new MeterProvider({ exporter, interval: 1000 }).getMeter('dynamodb')
metrics.dynamoReads = meters.dynamoMeter.createCounter('dynamo-read', { description: 'Reads on DynamoDB' })
metrics.dynamoReadDurations = meters.dynamoMeter.createHistogram('dynamo-reads-durations', {
  description: 'Reads durations on DynamoDB'
})

meters.s3Meter = new MeterProvider({ exporter, interval: 1000 }).getMeter('s3')
metrics.s3Fetchs = meters.s3Meter.createCounter('s3-fetchs', { description: 'Fetchs on S3' })
metrics.s3FetchsDurations = meters.s3Meter.createHistogram('s3-fetchs-durations', {
  description: 'Fetchs durations on S3'
})

/* c8 ignore next 7 */
async function startTelemetry(port) {
  exporter._port = port

  // Start the server
  await exporter.startServer()
  logger.info(`OpenTelemetry server and listening on port ${port} ...`)
}

module.exports = {
  meters,
  metrics,
  startTelemetry
}
