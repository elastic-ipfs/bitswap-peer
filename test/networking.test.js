'use strict'

process.env.LOG_LEVEL = 'fatal'

const PeerId = require('peer-id')
const t = require('tap')

const { Connection } = require('../src/networking')
const { BITSWAP_V_100: protocol } = require('../src/protocol')
const { startService } = require('../src/service')
const { getFreePort, createClient, prepare, teardown } = require('./utils/helpers')

t.test('send - after closing behavior', async t => {
  const { client, service, connection } = await prepare(t, protocol)

  connection.close()

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  // Sending is rejected
  t.throws(() => connection.send('ANYTHING'), { message: 'The stream is closed.' })

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  await teardown(t, client, service, connection)
})

t.test('error handling', async t => {
  t.plan(2)

  const peerId = await PeerId.create()
  const { port, service } = await startService(peerId, await getFreePort())
  const { stream, node: client } = await createClient(peerId, port, protocol)

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

  t.equal((await receiveError).message, 'SOURCE ERROR')
  t.equal((await sendError).message, 'SINK ERROR')

  await teardown(t, client, service, connection)
})
