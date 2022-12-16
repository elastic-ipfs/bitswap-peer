import config from './config.js'
import { telemetry } from './telemetry.js'

/**
 * `bitswap-request-duration` is been reset every telemetry.export call (in /metrics)
 */
export function getHealthCheckValues () {
  return {
    connections: telemetry.getGaugeValue('bitswap-active-connections'),
    pendingRequestBlocks: telemetry.getGaugeValue('bitswap-pending-entries'),
    eventLoopUtilization: telemetry.getGaugeValue('bitswap-elu'),
    responseDuration: telemetry.getHistogramValue('bitswap-request-duration') ?? -1
  }
}

/**
 * called every 1 second
 */
export function checkReadiness (logger) {
  const resources = getHealthCheckValues()

  if (resources.connections > config.readinessMaxConnections) {
    logger.warn({ connections: resources.connections, maxConnections: config.readinessMaxConnections },
      'Service is not ready due to max connections')
    return false
  }

  if (resources.pendingRequestBlocks > config.readinessMaxPendingRequestBlocks) {
    logger.warn({ pendingRequestBlocks: resources.pendingRequestBlocks, maxPendingRequestBlocks: config.readinessMaxPendingRequestBlocks },
      'Service is not ready due to max pending request blocks')
    return false
  }

  if (resources.eventLoopUtilization > config.readinessMaxEventLoopUtilization) {
    logger.warn({ eventLoopUtilization: resources.eventLoopUtilization, maxEventLoopUtilization: config.readinessMaxEventLoopUtilization },
      'Service is not ready due to max event loop utilization')
    return false
  }

  if (resources.responseDuration > config.readinessMaxResponseDuration) {
    logger.warn({ responseDuration: resources.pendingRequestBlocks, maxResponseDuration: config.readinessMaxResponseDuration },
      'Service is not ready due to max response duration')
    return false
  }

  return true
}
