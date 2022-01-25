'use strict'

process.env.LOG_LEVEL = 'fatal'

const { once } = require('events')
const t = require('tap')
const { Connection } = require('../src/networking')
const { BITSWAP_V_100: protocol } = require('../src/protocol')
const { startService } = require('../src/service')
const { prepare, teardown, createClient } = require('./utils/helpers')
const { mockAWS } = require('./utils/mock')

mockAWS(t)

t.test('send - after closing behavior', async t => {
  const { client, service, connection } = await prepare(protocol)

  connection.close()

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  // Sending is rejected
  t.throws(() => connection.send('ANYTHING'), { message: 'The stream is closed.' })

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  await teardown(client, service, connection)
})

t.test('error handling', async t => {
  t.plan(2)

  const { peerId, port, service } = await startService()
  const { connection: client, stream } = await createClient(peerId, port, protocol)

  stream.source[Symbol.asyncIterator] = function () {
    return {
      next: () => {
        return Promise.reject(new Error('SOURCE ERROR'))
      }
    }
  }

  stream.sink = function () {
    return Promise.reject(new Error('SINK ERROR'))
  }

  const connection = new Connection(stream)
  connection.on('error', () => {})

  const receiveError = new Promise(resolve => {
    connection.once('error:receive', resolve)
  })

  const sendError = new Promise(resolve => {
    connection.once('error:send', resolve)
  })

  connection.send('ANYTHING')

  client.close()
  connection.close()
  service.stop()

  t.equal((await receiveError).message, 'SOURCE ERROR')
  t.equal((await sendError).message, 'SINK ERROR')
})
