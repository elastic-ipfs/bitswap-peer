'use strict'

process.env.CACHE_BLOCK_INFO = 'false'
process.env.CACHE_BLOCK_DATA = 'false'
process.env.LOG_LEVEL = 'fatal'

const { once } = require('events')
const t = require('tap')

const { port } = require('../src/config')
const { BITSWAP_V_100: protocol, Entry, Message, WantList } = require('../src/protocol')
const { startService } = require('../src/service')
const { prepare, receiveMessages, teardown } = require('./utils/helpers')
const { mockAWS, mockS3GetObject } = require('./utils/mock')

t.beforeEach(() => mockAWS())

t.test('service - uses the default port', async t => {
  const { service, port: assignedPort } = await startService()

  t.equal(assignedPort, port)

  await service.stop()
})

t.test('service - handles connection error', async t => {
  const { client, service, connection } = await prepare(t, protocol)

  connection.send(Buffer.from([0, 1, 2, 3]))
  const [error] = await once(service, 'error:receive')

  t.equal(error.constructor.name, 'RangeError')
  t.equal(error.message, 'index out of range: 4 + 3 > 4')

  await teardown(t, client, service, connection)
})

t.test('service - handles blocks error', async t => {
  mockS3GetObject({ bucket: 'the-bucket', key: 'the-key', response: () => { throw new Error('FAILED') } })

  const { client, service, connection, receiver } = await prepare(t, protocol)

  const wantList = new WantList([new Entry('the-key', 1, false, Entry.WantType.Block, true)], false)

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await receiveMessages(receiver, protocol)
  await teardown(t, client, service, connection)

  t.equal(responses.length, 0)
})
