'use strict'

const { once } = require('events')
const t = require('tap')

const config = require('../src/config')
const { BITSWAP_V_100: protocol, Entry, Message, WantList } = require('../src/protocol')
const { cid1, cid1Content, cid2 } = require('./fixtures/cids')
const helper = require('./utils/helper')
const { mockAWS, createMockAgent } = require('./utils/mock')

t.test('service - blocks are cached', async t => {
  // TODO fix, is not asserting cache, only responses
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await helper.setup({ protocol, awsClient })

  const wantList = new WantList([new Entry(cid1, 1, false, Entry.WantType.Block, true)], false)

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response1] = await helper.receiveMessages(receiver, protocol)

  t.equal(response1.blocks.length, 1)
  t.equal(response1.blockPresences.length, 0)

  await connection.send(request.encode(protocol))
  const [response2] = await helper.receiveMessages(receiver, protocol)

  t.equal(response2.blocks.length, 1)
  t.equal(response2.blockPresences.length, 0)

  await helper.teardown(client, service, connection)

  helper.hasRawBlock(t, response1, cid1Content, 1)
  helper.hasRawBlock(t, response1, cid1Content, 1)
})

t.test('service - handles connection error', async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection } = await helper.setup({ protocol, awsClient })

  connection.send(Buffer.from([0, 1, 2, 3]))
  const [error] = await once(service, 'error:receive')

  t.equal(error.constructor.name, 'RangeError')
  t.equal(error.message, 'index out of range: 4 + 3 > 4')

  await helper.teardown(client, service, connection)
})

t.test('service - handles blocks error', async t => {
  const { awsClient, s3 } = await mockAWS(config)
  awsClient.agent = createMockAgent()
  awsClient.agent
    .get(awsClient.s3Url(s3.region, s3.bucket))
    .intercept({ path: '/' })
    .replyWithError(new Error('FAILED'))
  const { client, service, connection, receiver } = await helper.setup({ protocol, awsClient })

  const wantList = new WantList([new Entry(cid2, 1, false, Entry.WantType.Block, true)], false)

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await helper.receiveMessages(receiver, protocol)
  await helper.teardown(client, service, connection)

  t.equal(responses.length, 0)
})
