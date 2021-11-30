'use strict'

const t = require('tap')
const dagPB = require('@ipld/dag-pb')
const { BITSWAP_V_110: protocol, Entry, Message, WantList } = require('../src/message')
const { sendData } = require('../src/networking')
const { cid1, cid2, cid3, cid4, cid1Content, cid2Link, prepare, receiveMessages } = require('./utils')

t.test(`${protocol} - uses the right fields when serializing and deserializing`, async t => {
  t.plan(12)

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

  const { client, server, stream } = await prepare(protocol)
  await sendData(stream, request.encode(protocol))
  const [response] = await receiveMessages(stream, protocol, 5000, 1, true)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 0)
  t.equal(response.payload.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.ok(response.payload[0].prefix.equals(Buffer.from([0x01, 0x55, 0x12, 0x20])))
  t.equal(response.payload[0].data.toString(), cid1Content)
  t.ok(response.payload[1].prefix.equals(Buffer.from([0x01, 0x70, 0x12, 0x20])))
  t.equal(Object.values(dagPB.decode(response.payload[1].data).Links)[0].Name, cid2Link)
})

t.test(`${protocol} - type=Mixed - cancel=true - no response received`, async t => {
  t.plan(1)

  const { client, server, stream } = await prepare(protocol)

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
  await sendData(stream, request.encode(protocol))

  const responses = await receiveMessages(stream, protocol)
  await client.close()
  await server.stop()

  t.equal(responses.length, 0)
})

t.test(`${protocol} - type=Block - sendDontHave=true - 2 hits / 2 misses - 2 blocks received`, async t => {
  t.plan(4)

  const { client, server, stream } = await prepare(protocol)

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
  await sendData(stream, request.encode(protocol))

  const [response] = await receiveMessages(stream, protocol)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.equal(response.blocks[0].data.toString(), cid1Content)
  t.equal(Object.values(dagPB.decode(response.blocks[1].data).Links)[0].Name, cid2Link)
})

t.test(`${protocol} - type=Block - sendDontHave=false - 2 hits / 2 misses - 2 blocks received`, async t => {
  t.plan(4)

  const { client, server, stream } = await prepare(protocol)

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
  await sendData(stream, request.encode(protocol))

  const [response] = await receiveMessages(stream, protocol)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.equal(response.blocks[0].data.toString(), cid1Content)
  t.equal(Object.values(dagPB.decode(response.blocks[1].data).Links)[0].Name, cid2Link)
})

t.test(`${protocol} - type=Have - sendDontHave=true - 2 hits / 2 misses - 2 blocks received`, async t => {
  t.plan(4)

  const { client, server, stream } = await prepare(protocol)

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
  await sendData(stream, request.encode(protocol))

  const [response] = await receiveMessages(stream, protocol)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.equal(response.blocks[0].data.toString(), cid1Content)
  t.equal(Object.values(dagPB.decode(response.blocks[1].data).Links)[0].Name, cid2Link)
})

t.test(`${protocol} - type=Have - sendDontHave=false - 2 hits / 2 misses - 2 blocks received`, async t => {
  t.plan(4)

  const { client, server, stream } = await prepare(protocol)

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
  await sendData(stream, request.encode(protocol))

  const [response] = await receiveMessages(stream, protocol)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.equal(response.blocks[0].data.toString(), cid1Content)
  t.equal(Object.values(dagPB.decode(response.blocks[1].data).Links)[0].Name, cid2Link)
})

t.test(`${protocol} - type=Mixed - sendDontHave=true - 2 blocks received`, async t => {
  t.plan(4)

  const { client, server, stream } = await prepare(protocol)

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
  await sendData(stream, request.encode(protocol))

  const [response] = await receiveMessages(stream, protocol)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.equal(response.blocks[0].data.toString(), cid1Content)
  t.equal(Object.values(dagPB.decode(response.blocks[1].data).Links)[0].Name, cid2Link)
})

t.test(`${protocol} - type=Mixed - sendDontHave=false - 2 blocks received`, async t => {
  t.plan(4)

  const { client, server, stream } = await prepare(protocol)

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
  await sendData(stream, request.encode(protocol))

  const [response] = await receiveMessages(stream, protocol)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 2)
  t.equal(response.blockPresences.length, 0)

  t.equal(response.blocks[0].data.toString(), cid1Content)
  t.equal(Object.values(dagPB.decode(response.blocks[1].data).Links)[0].Name, cid2Link)
})
