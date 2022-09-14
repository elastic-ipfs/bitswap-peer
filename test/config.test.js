'use strict'

const t = require('tap')

const { awsClientConcurrency, blocksTable, carsTable, port, httpPort } = require('../src/config')

t.test('config - it exports reasonable defaults', async t => {
  // TODO hardcode defaults
  t.equal(awsClientConcurrency, 128)
  t.equal(blocksTable, 'blocks')
  t.equal(carsTable, 'cars')
  t.equal(port, 3000)
  t.equal(httpPort, 3001)
})
