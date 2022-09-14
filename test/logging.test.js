'use strict'

const t = require('tap')
const { serializeError } = require('../src/logging')

t.test('logging - an error is properly serialized', async t => {
  const errorWithCode = new Error('FAILED')
  errorWithCode.code = 'CODE'

  const error = new Error('FAILED')

  t.match(serializeError(error), '[Error] FAILED')
  t.match(serializeError(errorWithCode), '[CODE] FAILED')
})
