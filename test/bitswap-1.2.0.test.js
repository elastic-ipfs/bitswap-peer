'use strict'

const t = require('tap')
const { setTimeout: sleep } = require('timers/promises')

const config = require('../src/config')
const { BITSWAP_V_120: protocol, BlockPresence, Entry, Message, WantList } = require('../src/protocol')
const { cid1, cid1Content, cid2, cid2Link, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('./fixtures/cids')
const {
  getPresence,
  hasSingleBlockWithHash,
  hasSingleDAGBlock,
  hasSingleRawBlock,
  prepare,
  receiveMessages,
  safeGetDAGLinks,
  teardown
} = require('./utils/helpers')
const { mockAWS } = require('./utils/mock')

const TIMEOUT = 1500

t.beforeEach(() => mockAWS())

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
  t.strictSame(Object.keys(entry), ['block', 'priority', 'cancel', 'wantType', 'sendDontHave'])
  t.equal(entry.block[0], 0x01)
  t.equal(entry.block[1], 0x55)
  t.equal(entry.block[2], 0x12)
  t.equal(entry.block[3], 0x20)

  const { client, service, connection, receiver } = await prepare(t, protocol)
  await connection.send(request.encode(protocol))
  const [response] = await receiveMessages(receiver, protocol, TIMEOUT, 1, true)
  await teardown(t, client, service, connection)

  const cid2Blocks = response.payload.filter(p => p.prefix.equals(Buffer.from([0x01, 0x70, 0x12, 0x20])))
  const cid1Presences = response.blockPresences.filter(b => b.cid.equals(cid1.bytes))
  const cid3Presences = response.blockPresences.filter(b => b.cid.equals(cid3.bytes))
  const cid4Presences = response.blockPresences.filter(b => b.cid.equals(cid4.bytes))

  t.equal(response.blocks.length, 0)
  t.equal(response.payload.length, 1)
  t.equal(response.blockPresences.length, 3)

  t.equal(cid2Blocks.length, 1)
  t.equal(safeGetDAGLinks(cid2Blocks[0])?.[0].Name, cid2Link)

  t.equal(cid1Presences.length, 1)
  t.equal(cid1Presences[0].type, BlockPresence.Type.Have)
  t.equal(cid3Presences.length, 1)
  t.equal(cid3Presences[0].type, BlockPresence.Type.DontHave)
  t.equal(cid4Presences.length, 1)
  t.equal(cid4Presences[0].type, BlockPresence.Type.DontHave)
})

t.test(`${protocol} - type=Mixed - cancel=true - no response received`, async t => {
  const { client, service, connection, receiver } = await prepare(t, protocol)

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

  const responses = await receiveMessages(receiver, protocol)
  await teardown(t, client, service, connection)

  t.equal(responses.length, 0)
})

t.test(
  `${protocol} - type=Block - sendDontHave=true - 2 hits / 2 misses - 2 blocks / 2 negative presences received`,
  async t => {
    const { client, service, connection, receiver } = await prepare(t, protocol)

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
    await teardown(t, client, service, connection)

    t.ok(response)
    t.equal(response.blocks.length, 2)
    t.equal(response.blockPresences.length, 2)

    hasSingleRawBlock(t, response, cid1Content)
    hasSingleDAGBlock(t, response, cid2Link)

    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)

t.test(`${protocol} - type=Block - sendDontHave=false - 2 hits / 2 misses - 2 blocks received`, async t => {
  const { client, service, connection, receiver } = await prepare(t, protocol)

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
  await teardown(t, client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  hasSingleRawBlock(t, response, cid1Content)
  hasSingleDAGBlock(t, response, cid2Link)
})

t.test(
  `${protocol} - type=Have - sendDontHave=true - 2 hits / 2 misses - 2 positive presences / 2 negative presences received`,
  async t => {
    const { client, service, connection, receiver } = await prepare(t, protocol)

    const wantList = new WantList(
      [
        new Entry(cid1, 1, false, Entry.WantType.Have, true),
        new Entry(cid2, 1, false, Entry.WantType.Have, true),
        new Entry(cid3, 1, false, Entry.WantType.Have, true),
        new Entry(cid4, 1, false, Entry.WantType.Have, true)
      ],
      false
    )

    const request = new Message(wantList, [], [], 0)
    await connection.send(request.encode(protocol))

    const [response] = await receiveMessages(receiver, protocol)
    await teardown(t, client, service, connection)

    t.equal(response.blocks.length, 0)
    t.equal(response.blockPresences.length, 4)

    t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
    t.equal(getPresence(t, response, cid2).type, BlockPresence.Type.Have)
    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)

t.test(`${protocol} - type=Have - sendDontHave=false - 2 hits / 2 misses - 2 positive presences received`, async t => {
  const { client, service, connection, receiver } = await prepare(t, protocol)

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
  await teardown(t, client, service, connection)

  t.equal(response.blocks.length, 0)
  t.equal(response.blockPresences.length, 2)

  t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
  t.equal(getPresence(t, response, cid2).type, BlockPresence.Type.Have)
})

t.test(
  `${protocol} - type=Mixed - sendDontHave=true - 2 hits / 2 misses - 1 block / 1 positive presences / 2 negative presences received`,
  async t => {
    const { client, service, connection, receiver } = await prepare(t, protocol)

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
    await teardown(t, client, service, connection)

    t.equal(response.blocks.length, 1)
    t.equal(response.blockPresences.length, 3)

    hasSingleDAGBlock(t, response, cid2Link)

    t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)

t.test(
  `${protocol} - type=Mixed - sendDontHave=false - 2 hits / 2 misses - 1 block / 1 positive presence received`,
  async t => {
    const { client, service, connection, receiver } = await prepare(t, protocol)

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
    await teardown(t, client, service, connection)

    t.equal(response.blocks.length, 1)
    t.equal(response.blockPresences.length, 1)

    hasSingleDAGBlock(t, response, cid2Link)

    t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
  }
)

t.test(`${protocol} - large blocks skipping`, async t => {
  const { client, service, connection, receiver } = await prepare(t, protocol)

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

  const responses = await receiveMessages(receiver, protocol, TIMEOUT, 2)
  await teardown(t, client, service, connection)

  const blocks = [...responses[0].blocks, ...responses[1].blocks]

  t.equal(responses.length, 2)
  t.equal(responses[0].blocks.length, 2)
  t.equal(responses[1].blocks.length, 1)

  await hasSingleBlockWithHash(t, { blocks }, cid5.multihash)
  await hasSingleBlockWithHash(t, { blocks }, cid6.multihash)
  await hasSingleBlockWithHash(t, { blocks }, cid7.multihash)
  await hasSingleBlockWithHash(t, { blocks }, cid8.multihash, true)
})

t.test(`${protocol} - messages splitting`, async t => {
  const { client, service, connection, receiver } = await prepare(t, protocol)
  const numPresences = 456

  const wantList = new WantList(
    [
      new Entry(cid9, 1, false, Entry.WantType.Block, true),
      new Entry(cid9, 1, false, Entry.WantType.Block, true),
      ...Array.from(Array(numPresences), () => new Entry(cid1, 1, false, Entry.WantType.Have, false))
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await receiveMessages(receiver, protocol, TIMEOUT, -1)
  await teardown(t, client, service, connection)

  t.equal(responses.reduce((t, r) => t + r.blocks.length, 0), 2)
  t.equal(responses.reduce((t, r) => t + r.blockPresences.length, 0), numPresences)
  t.ok(responses.length >= Math.ceil(wantList.entries.length / config.blocksBatchSize))
})

t.test(`${protocol} - large presences splitting - single block is smaller than MAX_MESSAGE_SIZE`, async t => {
  config.maxMessageSize = 150
  const { client, service, connection, receiver } = await prepare(t, protocol)

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Have, true),
      new Entry(cid2, 1, false, Entry.WantType.Have, true),
      new Entry(cid5, 1, false, Entry.WantType.Have, true)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await receiveMessages(receiver, protocol, TIMEOUT, -1)
  await teardown(t, client, service, connection)

  t.equal(responses.length, wantList.entries.length)

  t.equal(getPresence(t, responses[0], cid1).type, BlockPresence.Type.Have)
  t.equal(getPresence(t, responses[1], cid2).type, BlockPresence.Type.Have)
  t.equal(getPresence(t, responses[2], cid5).type, BlockPresence.Type.Have)
})

t.test(`${protocol} - closes streams properly`, async t => {
  const { client, service, connection, receiver } = await prepare(t, protocol)
  const entry = new Entry(cid1, 1, false, Entry.WantType.Block, true)
  const wantList = new WantList([entry], false)
  const request = new Message(wantList, [], [], 0)

  connection.send(request.encode(protocol))
  await receiveMessages(receiver, protocol, TIMEOUT, 1)
  connection.close()

  // Wait for streams to be closed (happens asynchronously)
  // TODO hardcoded timers
  await sleep(1000)

  const peerConnections = Array.from(service.connectionManager.connections.entries())
  t.equal(peerConnections.length, 1, 'Service has only 1 peer with connections')

  const [, connnections] = peerConnections[0]
  t.equal(connnections.length, 1, 'Service has 1 connection to client')

  const streams = connnections[0].streams
  t.equal(streams.length, 0, 'Service has 0 open streams to client')

  await teardown(t, client, service, connection)
})
