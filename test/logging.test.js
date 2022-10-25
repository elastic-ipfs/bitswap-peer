
import t from 'tap'
import { serializeError } from '../src/logging.js'

t.test('logging - an error is properly serialized', async t => {
  const error = new Error('FAILED')

  t.match(serializeError(error), '[Error] FAILED')
})

t.test('logging - an error with code is properly serialized', async t => {
  const errorWithCode = new Error('FAILED')
  errorWithCode.code = 'CODE'

  t.match(serializeError(errorWithCode), '[CODE] FAILED')
})
