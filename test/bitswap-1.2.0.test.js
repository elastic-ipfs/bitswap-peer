'use strict'

const t = require('tap')
const dagPB = require('@ipld/dag-pb')
const { BITSWAP_V_120: protocol, BlockPresence, Entry, Message, WantList } = require('../src/message')
const { sendData } = require('../src/networking')
const { cid1, cid2, cid3, cid4, cid1Content, cid2Link, prepare, receiveMessages } = require('./utils')

t.test(`${protocol} - uses the right fields when serializing and deserializing`, async t => {
  t.plan(16)

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

  const { client, server, stream } = await prepare(protocol)
  await sendData(stream, request.encode(protocol))
  const [response] = await receiveMessages(stream, protocol, 5000, 1, true)
  await client.close()
  await server.stop()

  t.equal(response.blocks.length, 0)
  t.equal(response.payload.length, 1)
  t.equal(response.blockPresences.length, 3)

  t.ok(response.payload[0].prefix.equals(Buffer.from([0x01, 0x70, 0x12, 0x20])))
  t.equal(Object.values(dagPB.decode(response.payload[0].data).Links)[0].Name, cid2Link)

  t.ok(response.blockPresences[0].cid.equals(cid1.bytes))
  t.equal(response.blockPresences[0].type, BlockPresence.Type.Have)
  t.ok(response.blockPresences[1].cid.equals(cid3.bytes))
  t.equal(response.blockPresences[1].type, BlockPresence.Type.DontHave)
  t.ok(response.blockPresences[2].cid.equals(cid4.bytes))
  t.equal(response.blockPresences[2].type, BlockPresence.Type.DontHave)
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

t.test(
  `${protocol} - type=Block - sendDontHave=true - 2 hits / 2 misses - 2 blocks / 2 negative presences received`,
  async t => {
    t.plan(8)

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
    t.equal(response.blockPresences.length, 2)

    t.equal(response.blocks[0].data.toString(), cid1Content)
    t.equal(Object.values(dagPB.decode(response.blocks[1].data).Links)[0].Name, cid2Link)

    t.equal(response.blockPresences[0].cid.toString(), cid3.toString())
    t.equal(response.blockPresences[0].type, BlockPresence.Type.DontHave)
    t.equal(response.blockPresences[1].cid.toString(), cid4.toString())
    t.equal(response.blockPresences[1].type, BlockPresence.Type.DontHave)
  }
)

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

t.test(
  `${protocol} - type=Have - sendDontHave=true - 2 hits / 2 misses - 2 positive presences / 2 negative presences received`,
  async t => {
    t.plan(10)

    const { client, server, stream } = await prepare(protocol)

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
    await sendData(stream, request.encode(protocol))

    const [response] = await receiveMessages(stream, protocol)
    await client.close()
    await server.stop()

    t.equal(response.blocks.length, 0)
    t.equal(response.blockPresences.length, 4)

    t.equal(response.blockPresences[0].cid.toString(), cid1.toString())
    t.equal(response.blockPresences[0].type, BlockPresence.Type.Have)
    t.equal(response.blockPresences[1].cid.toString(), cid2.toString())
    t.equal(response.blockPresences[1].type, BlockPresence.Type.Have)
    t.equal(response.blockPresences[2].cid.toString(), cid3.toString())
    t.equal(response.blockPresences[2].type, BlockPresence.Type.DontHave)
    t.equal(response.blockPresences[3].cid.toString(), cid4.toString())
    t.equal(response.blockPresences[3].type, BlockPresence.Type.DontHave)
  }
)

t.test(`${protocol} - type=Have - sendDontHave=false - 2 hits / 2 misses - 2 positive presences received`, async t => {
  t.plan(6)

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

  t.equal(response.blocks.length, 0)
  t.equal(response.blockPresences.length, 2)

  t.equal(response.blockPresences[0].cid.toString(), cid1.toString())
  t.equal(response.blockPresences[0].type, BlockPresence.Type.Have)
  t.equal(response.blockPresences[1].cid.toString(), cid2.toString())
  t.equal(response.blockPresences[1].type, BlockPresence.Type.Have)
})

t.test(
  `${protocol} - type=Mixed - sendDontHave=true - 2 hits / 2 misses - 1 block / 1 positive presences / 2 negative presences received`,
  async t => {
    t.plan(9)

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

    t.equal(response.blocks.length, 1)
    t.equal(response.blockPresences.length, 3)

    t.equal(Object.values(dagPB.decode(response.blocks[0].data).Links)[0].Name, cid2Link)

    t.equal(response.blockPresences[0].cid.toString(), cid1.toString())
    t.equal(response.blockPresences[0].type, BlockPresence.Type.Have)
    t.equal(response.blockPresences[1].cid.toString(), cid3.toString())
    t.equal(response.blockPresences[1].type, BlockPresence.Type.DontHave)
    t.equal(response.blockPresences[2].cid.toString(), cid4.toString())
    t.equal(response.blockPresences[2].type, BlockPresence.Type.DontHave)
  }
)

t.test(
  `${protocol} - type=Mixed - sendDontHave=false - 2 hits / 2 misses - 1 block / 1 positive presence received`,
  async t => {
    t.plan(5)

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

    t.equal(response.blocks.length, 1)
    t.equal(response.blockPresences.length, 1)

    t.equal(Object.values(dagPB.decode(response.blocks[0].data).Links)[0].Name, cid2Link)

    t.equal(response.blockPresences[0].cid.toString(), cid1.toString())
    t.equal(response.blockPresences[0].type, BlockPresence.Type.Have)
  }
)
