'use strict'

process.env.CACHE_BLOCKS_INFO = 'true'
process.env.CACHE_BLOCK_DATA = 'true'
process.env.LOG_LEVEL = 'fatal'

const { once } = require('events')
const t = require('tap')

const { port } = require('../src/config')
const { BITSWAP_V_100: protocol, Entry, Message, WantList } = require('../src/protocol')
const { startService } = require('../src/service')
const { cid1, cid1Content, cid2 } = require('./fixtures/cids')
const { hasRawBlock, prepare, receiveMessages, teardown } = require('./utils/helpers')
const { createMockAgent, mockAWS } = require('./utils/mock')

t.before(() => mockAWS(t))

t.test('service - uses the default port', async t => {
  t.plan(1)

  const { service, port: assignedPort } = await startService()

  t.equal(assignedPort, port)

  await service.stop()
})

t.test('service - blocks are cached', async t => {
  t.plan(6)

  const { client, service, connection, receiver } = await prepare(t, protocol)

  const wantList = new WantList([new Entry(cid1, 1, false, Entry.WantType.Block, true)], false)

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response1] = await receiveMessages(receiver, protocol)

  t.equal(response1.blocks.length, 1)
  t.equal(response1.blockPresences.length, 0)

  await connection.send(request.encode(protocol))
  const [response2] = await receiveMessages(receiver, protocol)

  t.equal(response2.blocks.length, 1)
  t.equal(response2.blockPresences.length, 0)

  await teardown(t, client, service, connection)

  hasRawBlock(t, response1, cid1Content, 1)
  hasRawBlock(t, response1, cid1Content, 1)
})

t.test('service - handles connection error', async t => {
  t.plan(2)

  const { client, service, connection } = await prepare(t, protocol)

  connection.send(Buffer.from([0, 1, 2, 3]))
  const [error] = await once(service, 'error:receive')

  t.equal(error.constructor.name, 'RangeError')
  t.equal(error.message, 'index out of range: 4 + 3 > 4')

  await teardown(t, client, service, connection)
})

t.test('service - handles blocks error', async t => {
  t.plan(1)

  const mockAgent = createMockAgent()

  mockAgent
    .get(`https://test-cars.s3.${process.env.AWS_REGION}.amazonaws.com`)
    .intercept({
      method: 'POST',
      path: '/'
    })
    .replyWithError(new Error('FAILED'))

  const { client, service, connection, receiver } = await prepare(t, protocol, mockAgent)

  // Use CID2, which is not already cached by the tests above
  const wantList = new WantList([new Entry(cid2, 1, false, Entry.WantType.Block, true)], false)

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await receiveMessages(receiver, protocol, 2000)
  await teardown(t, client, service, connection)

  t.equal(responses.length, 0)
})
