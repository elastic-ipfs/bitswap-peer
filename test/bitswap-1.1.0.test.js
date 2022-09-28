'use strict'

const t = require('tap')

const config = require('../src/config')
const { BITSWAP_V_110: protocol, Entry, Message, WantList } = require('../src/protocol')
const { cid1, cid1Content, cid2, cid2Link, cid3, cid4, cid5, cid6, cid7, cid8 } = require('./fixtures/cids')
const {
  hasSingleBlockWithHash,
  hasSingleDAGBlock,
  hasSingleRawBlock,
  setup,
  receiveMessages,
  safeGetDAGLinks,
  teardown
} = require('./utils/helper')
const { mockAWS } = require('./utils/mock')

t.jobs = 10

t.test(`${protocol} - uses the right fields when serializing and deserializing`, async t => {
  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Have, true),
      new Entry(cid2, 1, false, Entry.WantType.Block, true),
      new Entry(cid3, 1, false, Entry.WantType.Have, true),
      new Entry(cid4, 1, false, Entry.WantType.Block, true)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  const encoded = request.serialize(protocol)

  const entry = encoded.wantlist.entries[0]
  t.strictSame(Object.keys(entry), ['block', 'priority', 'cancel'])
  t.equal(entry.block[0], 0x01)
  t.equal(entry.block[1], 0x55)
  t.equal(entry.block[2], 0x12)
  t.equal(entry.block[3], 0x20)

  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  await connection.send(request.encode(protocol))
  const [response] = await receiveMessages(receiver, protocol, 5000, 1, true)
  await teardown(client, service, connection)

  const cid1Blocks = response.payload.filter(p => p.prefix.equals(Buffer.from([0x01, 0x55, 0x12, 0x20])))
  const cid2Blocks = response.payload.filter(p => p.prefix.equals(Buffer.from([0x01, 0x70, 0x12, 0x20])))

  t.equal(response.blocks.length, 0)
  t.equal(response.payload.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.equal(cid1Blocks.length, 1)
  t.equal(cid1Blocks[0].data.toString(), cid1Content)
  t.equal(cid2Blocks.length, 1)
  t.equal(safeGetDAGLinks(cid2Blocks[0])?.[0].Name, cid2Link)
})

t.test(`${protocol} - type=Block - sendDontHave=true - 2 hits / 2 misses - 2 blocks received`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Block, true),
      new Entry(cid2, 1, false, Entry.WantType.Block, true),
      new Entry(cid3, 1, false, Entry.WantType.Block, true),
      new Entry(cid4, 1, false, Entry.WantType.Block, true)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response] = await receiveMessages(receiver, protocol)
  await teardown(client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  hasSingleRawBlock(t, response, cid1Content)
  hasSingleDAGBlock(t, response, cid2Link)
})

t.test(`${protocol} - type=Block - sendDontHave=false - 2 hits / 2 misses - 2 blocks received`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Block, false),
      new Entry(cid2, 1, false, Entry.WantType.Block, false),
      new Entry(cid3, 1, false, Entry.WantType.Block, false),
      new Entry(cid4, 1, false, Entry.WantType.Block, false)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response] = await receiveMessages(receiver, protocol)
  await teardown(client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  hasSingleRawBlock(t, response, cid1Content)
  hasSingleDAGBlock(t, response, cid2Link)
})

t.test(`${protocol} - type=Have - sendDontHave=true - 2 hits / 2 misses - 2 blocks received`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Have, false),
      new Entry(cid2, 1, false, Entry.WantType.Have, false),
      new Entry(cid3, 1, false, Entry.WantType.Have, false),
      new Entry(cid4, 1, false, Entry.WantType.Have, false)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response] = await receiveMessages(receiver, protocol)
  await teardown(client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  hasSingleRawBlock(t, response, cid1Content)
  hasSingleDAGBlock(t, response, cid2Link)
})

t.test(`${protocol} - type=Have - sendDontHave=false - 2 hits / 2 misses - 2 blocks received`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Have, false),
      new Entry(cid2, 1, false, Entry.WantType.Have, false),
      new Entry(cid3, 1, false, Entry.WantType.Have, false),
      new Entry(cid4, 1, false, Entry.WantType.Have, false)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response] = await receiveMessages(receiver, protocol)
  await teardown(client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  hasSingleRawBlock(t, response, cid1Content)
  hasSingleDAGBlock(t, response, cid2Link)
})

t.test(`${protocol} - type=Mixed - sendDontHave=true - 2 blocks received`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Have, true),
      new Entry(cid2, 1, false, Entry.WantType.Block, true),
      new Entry(cid3, 1, false, Entry.WantType.Have, true),
      new Entry(cid4, 1, false, Entry.WantType.Block, true)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response] = await receiveMessages(receiver, protocol)
  await teardown(client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  hasSingleRawBlock(t, response, cid1Content)
  hasSingleDAGBlock(t, response, cid2Link)
})

t.test(`${protocol} - type=Mixed - sendDontHave=false - 2 blocks received`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Have, false),
      new Entry(cid2, 1, false, Entry.WantType.Block, false),
      new Entry(cid3, 1, false, Entry.WantType.Have, false),
      new Entry(cid4, 1, false, Entry.WantType.Block, false)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response] = await receiveMessages(receiver, protocol)
  await teardown(client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  hasSingleRawBlock(t, response, cid1Content)
  hasSingleDAGBlock(t, response, cid2Link)
})

t.test(`${protocol} - type=Mixed - cancel=true - no response received`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, true, Entry.WantType.Have, true),
      new Entry(cid2, 1, true, Entry.WantType.Block, true),
      new Entry(cid3, 1, true, Entry.WantType.Have, true),
      new Entry(cid4, 1, true, Entry.WantType.Block, true)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await receiveMessages(receiver, protocol, 5000)
  await teardown(client, service, connection)

  t.equal(responses.length, 0)
})

t.test(`${protocol} - large blocks skipping`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid5, 1, false, Entry.WantType.Block, true),
      new Entry(cid6, 1, false, Entry.WantType.Block, true),
      new Entry(cid7, 1, false, Entry.WantType.Block, true),
      new Entry(cid8, 1, false, Entry.WantType.Block, true)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await receiveMessages(receiver, protocol, 30000, 2)
  await teardown(client, service, connection)

  const blocks = [...responses[0].blocks, ...responses[1].blocks]

  t.equal(responses.length, 2)
  t.equal(responses[0].blocks.length, 2)
  t.equal(responses[1].blocks.length, 1)

  await hasSingleBlockWithHash(t, { blocks }, cid5.multihash)
  await hasSingleBlockWithHash(t, { blocks }, cid6.multihash)
  await hasSingleBlockWithHash(t, { blocks }, cid7.multihash)
  await hasSingleBlockWithHash(t, { blocks }, cid8.multihash, true)
})
