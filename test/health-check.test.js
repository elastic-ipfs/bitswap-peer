'use strict'

process.env.CACHE_BLOCK_INFO = 'true'
process.env.CACHE_BLOCK_DATA = 'true'
process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

t.test('healthCheck - readiness returns 200', async t => {
  /** @type {import('../src/health-check.js')} */
  const healthCheckModuleWithMocks = await t.mock('../src/health-check.js', {
    '../src/peer-id.js': {
      getPeerId: () => 'Works'
    },
    '../src/storage.js': {
      searchCarInDynamoV1: () => 'Works'
    }
  })
  const statusCode = await healthCheckModuleWithMocks.healthCheck.checkReadiness()
  t.equal(statusCode, 200)
})
