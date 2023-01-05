import t from 'tap'
import config from '../src/config.js'
import { getHealthCheckValues, checkReadiness } from '../src/health-check.js'
import { telemetry } from '../src/telemetry.js'
import * as helper from './utils/helper.js'

t.test('getHealthCheckValues', async t => {
  t.test('should get current resource usage', async t => {
    telemetry.resetAll()
    telemetry.setGauge('bitswap-active-connections', 1)
    telemetry.setGauge('bitswap-pending-entries', 2)
    telemetry.setGauge('bitswap-elu', 0.01)

    const resources = getHealthCheckValues()

    t.equal(resources.connections, 1)
    t.equal(resources.pendingRequestBlocks, 2)
    t.equal(resources.eventLoopUtilization, 0.01)
  })
})

t.test('checkReadiness', async t => {
  t.test('should be fine on healthy values', async t => {
    telemetry.resetAll()
    telemetry.setGauge('bitswap-active-connections', 1)
    telemetry.setGauge('bitswap-pending-entries', 2)
    telemetry.setGauge('bitswap-elu', 0.01)

    const logger = helper.spyLogger()

    t.equal(checkReadiness(logger), true)
  })

  t.test('should be not ready on many connections', async t => {
    telemetry.resetAll()
    telemetry.setGauge('bitswap-active-connections', config.readinessMaxConnections + 1)
    telemetry.setGauge('bitswap-pending-entries', 2)
    telemetry.setGauge('bitswap-elu', 0.01)

    const logger = helper.spyLogger()

    t.equal(checkReadiness(logger), false)
    t.equal(logger.messages.warn.length, 1)
    t.equal(logger.messages.warn[0][1], 'Service is not ready due to max connections')
  })

  t.test('should be not ready on many pending request blocks', async t => {
    telemetry.resetAll()
    telemetry.setGauge('bitswap-active-connections', 0)
    telemetry.setGauge('bitswap-pending-entries', config.readinessMaxPendingRequestBlocks + 1)
    telemetry.setGauge('bitswap-elu', 0.01)

    const logger = helper.spyLogger()

    t.equal(checkReadiness(logger), false)
    t.equal(logger.messages.warn.length, 1)
    t.equal(logger.messages.warn[0][1], 'Service is not ready due to max pending request blocks')
  })

  t.test('should be not ready on too much event loop utilization', async t => {
    telemetry.resetAll()
    telemetry.setGauge('bitswap-active-connections', 0)
    telemetry.setGauge('bitswap-pending-entries', 0)
    telemetry.setGauge('bitswap-elu', config.readinessMaxEventLoopUtilization + 0.01)

    const logger = helper.spyLogger()

    t.equal(checkReadiness(logger), false)
    t.equal(logger.messages.warn.length, 1)
    t.equal(logger.messages.warn[0][1], 'Service is not ready due to max event loop utilization')
  })
})
