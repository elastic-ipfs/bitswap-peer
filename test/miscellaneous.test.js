'use strict'

process.env.ENV_FILE_PATH = '/dev/null'
process.env.LOG_LEVEL = ''
process.env.NODE_DEBUG = 'aws-ipfs-bitswap-peer'

const t = require('tap')
const { getPeerId, concurrency, blocksTable, carsTable, port } = require('../src/config')
const { serializeError } = require('../src/logging')

t.test('config - a new PeerId is created when none is downloaded from S3', async t => {
  t.plan(1)

  t.ok(await getPeerId())
})

t.test('config - it exports reasonable defaults', t => {
  t.plan(4)

  t.equal(concurrency, 16)
  t.equal(blocksTable, 'blocks')
  t.equal(carsTable, 'cars')
  t.equal(port, 0)
})

t.test('logging - an error is properly serialized', t => {
  t.plan(2)

  const errorWithCode = new Error('FAILED')
  errorWithCode.code = 'CODE'

  const error = new Error('FAILED')

  t.equal(serializeError(error), '[Error] FAILED')
  t.equal(serializeError(errorWithCode), '[CODE] FAILED')
})
