
import t from 'tap'

import config from '../src/config.js'
import { BITSWAP_V_100 as protocol, Entry, Message, WantList } from 'e-ipfs-core-lib'
import { cid1, cid1Content, cid2, cid2Link, cid3, cid4, cid5, cid6, cid7, cid8 } from './fixtures/cids.js'
import {
  hasSingleBlockWithHash,
  setup,
  receiveMessages,
  safeGetDAGLinks,
  teardown
} from './utils/helper.js'
import { mockAWS } from './utils/mock.js'

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
  t.equal(entry.block[0], 0x12)
  t.equal(entry.block[1], 0x20)

  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  await connection.send(request.encode(protocol))
  // TODO remove hard timeouts
  const [response] = await receiveMessages(receiver, protocol, 5000, 1, true)

  await teardown(client, service, connection)

  t.equal(response.blocks.length, 2)
  t.equal(response.payload.length, 0)
  t.equal(response.blockPresences.length, 0)

  t.ok(response.blocks[0] instanceof Uint8Array)
  t.ok(response.blocks[1] instanceof Uint8Array)

  const cid1Blocks = response.blocks.filter(b => Buffer.from(b).toString('utf8') === cid1Content)
  t.equal(cid1Blocks.length, 1)

  const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b)?.[0]?.Name === cid2Link)
  t.equal(cid2Blocks.length, 1)
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

  const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
  t.equal(cid1Blocks.length, 1)

  const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
  t.equal(cid2Blocks.length, 1)
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

  const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
  t.equal(cid1Blocks.length, 1)

  const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
  t.equal(cid2Blocks.length, 1)
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

  const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
  t.equal(cid1Blocks.length, 1)

  const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
  t.equal(cid2Blocks.length, 1)
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

  const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
  t.equal(cid1Blocks.length, 1)

  const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
  t.equal(cid2Blocks.length, 1)
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

  const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
  t.equal(cid1Blocks.length, 1)

  const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
  t.equal(cid2Blocks.length, 1)
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

  const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
  t.equal(cid1Blocks.length, 1)

  const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
  t.equal(cid2Blocks.length, 1)
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

  // TODO remove hard timeouts
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

  // TODO remove hard timeouts
  const responses = await receiveMessages(receiver, protocol, 10000, 2)
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
