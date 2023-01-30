
import t from 'tap'

import config from '../src/config.js'
import { BITSWAP_V_120 as protocol, BlockPresence, Entry, Message, WantList } from 'e-ipfs-core-lib'
import { sleep } from '../src/util.js'
import { cid1, cid1Content, cid2, cid2Link, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } from './fixtures/cids.js'
import {
  getPresence,
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
  t.strictSame(Object.keys(entry), ['block', 'priority', 'cancel', 'wantType', 'sendDontHave'])
  t.equal(entry.block[0], 0x01)
  t.equal(entry.block[1], 0x55)
  t.equal(entry.block[2], 0x12)
  t.equal(entry.block[3], 0x20)

  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  await connection.send(request.encode(protocol))
  const [response] = await receiveMessages(receiver, protocol, 5000, 1, true)
  await teardown(client, service, connection)

  const cid2Blocks = response.payload.filter(p => Buffer.compare(p.prefix, Buffer.from([0x01, 0x70, 0x12, 0x20])) === 0)
  const cid1Presences = response.blockPresences.filter(b => Buffer.compare(b.cid, cid1.bytes) === 0)
  const cid3Presences = response.blockPresences.filter(b => Buffer.compare(b.cid, cid3.bytes) === 0)
  const cid4Presences = response.blockPresences.filter(b => Buffer.compare(b.cid, cid4.bytes) === 0)

  t.equal(response.blocks.length, 0)
  t.equal(response.payload.length, 1)
  t.equal(response.blockPresences.length, 3)

  t.equal(cid2Blocks.length, 1)
  t.equal(safeGetDAGLinks(cid2Blocks[0].data)?.[0].Name, cid2Link)

  t.equal(cid1Presences.length, 1)
  t.equal(cid1Presences[0].type, BlockPresence.Type.Have)
  t.equal(cid3Presences.length, 1)
  t.equal(cid3Presences[0].type, BlockPresence.Type.DontHave)
  t.equal(cid4Presences.length, 1)
  t.equal(cid4Presences[0].type, BlockPresence.Type.DontHave)
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

  const responses = await receiveMessages(receiver, protocol)
  await teardown(client, service, connection)

  t.equal(responses.length, 0)
})

t.test(
  `${protocol} - type=Block - sendDontHave=true - 2 hits / 2 misses - 2 blocks / 2 negative presences received`,
  async t => {
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
    t.equal(response.blockPresences.length, 2)

    const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
    t.equal(cid1Blocks.length, 1)

    const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
    t.equal(cid2Blocks.length, 1)

    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)

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

t.test(
  `${protocol} - type=Have - sendDontHave=true - 2 hits / 2 misses - 2 positive presences / 2 negative presences received`,
  async t => {
    const { awsClient } = await mockAWS(config)
    const { client, service, connection, receiver } = await setup({ protocol, awsClient })

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
    await teardown(client, service, connection)

    t.equal(response.blocks.length, 0)
    t.equal(response.blockPresences.length, 4)

    t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
    t.equal(getPresence(t, response, cid2).type, BlockPresence.Type.Have)
    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)

t.test(`${protocol} - type=Have - sendDontHave=false - 2 hits / 2 misses - 2 positive presences received`, async t => {
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

  t.equal(response.blocks.length, 0)
  t.equal(response.blockPresences.length, 2)

  t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
  t.equal(getPresence(t, response, cid2).type, BlockPresence.Type.Have)
})

t.test(
  `${protocol} - type=Mixed - sendDontHave=true - 2 hits / 2 misses - 1 block / 1 positive presences / 2 negative presences received`,
  async t => {
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

    t.equal(response.blocks.length, 1)
    t.equal(response.blockPresences.length, 3)

    const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
    t.equal(cid2Blocks.length, 1)

    t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)

t.test(
  `${protocol} - type=Mixed - sendDontHave=false - 2 hits / 2 misses - 1 block / 1 positive presence received`,
  async t => {
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

    t.equal(response.blocks.length, 1)
    t.equal(response.blockPresences.length, 1)

    const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
    t.equal(cid2Blocks.length, 1)

    t.equal(getPresence(t, response, cid1).type, BlockPresence.Type.Have)
  }
)

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

  const responses = await receiveMessages(receiver, protocol, 5000, 2)
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

t.test(`${protocol} - large messages splitted in multiple responses`, async t => {
  config.maxMessageSize = 8

  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const wantList = new WantList(
    [
      new Entry(cid1, 1, false, Entry.WantType.Have, true),
      new Entry(cid2, 1, false, Entry.WantType.Block, true),
      new Entry(cid3, 1, false, Entry.WantType.Have, true),
      new Entry(cid4, 1, false, Entry.WantType.Block, true),
      new Entry(cid5, 1, false, Entry.WantType.Have, true),
      new Entry(cid6, 1, false, Entry.WantType.Block, true),
      new Entry(cid7, 1, false, Entry.WantType.Have, true),
      new Entry(cid8, 1, false, Entry.WantType.Block, true),
      new Entry(cid9, 1, false, Entry.WantType.Have, true)
    ],
    false
  )

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await receiveMessages(receiver, protocol, -1, 9)
  await teardown(client, service, connection)

  t.equal(responses.length, 9)

  t.equal(responses.reduce((t, r) => t + r.blocks.length, 0), 2)
  t.equal(responses.reduce((t, r) => t + r.blockPresences.length, 0), 7)
})

t.test(`${protocol} - large presences splitted in multiple responses - single block is smaller than MAX_MESSAGE_SIZE`, async t => {
  config.maxMessageSize = 150

  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

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

  const responses = await receiveMessages(receiver, protocol, 1000, -1)
  await teardown(client, service, connection)

  t.equal(responses.length, wantList.entries.length)

  t.equal(getPresence(t, responses[0], cid1).type, BlockPresence.Type.Have)
  t.equal(getPresence(t, responses[1], cid2).type, BlockPresence.Type.Have)
  t.equal(getPresence(t, responses[2], cid5).type, BlockPresence.Type.Have)
})

t.test(`${protocol} - closes streams properly`, async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await setup({ protocol, awsClient })

  const entry = new Entry(cid1, 1, false, Entry.WantType.Block, true)
  const wantList = new WantList([entry], false)
  const request = new Message(wantList, [], [], 0)

  connection.send(request.encode(protocol))
  await receiveMessages(receiver, protocol, -1, 1)
  connection.close()
  client.stop()

  // Wait for streams to be closed (happens asynchronously)
  await sleep(50)

  const peerConnections = Array.from(service.connectionManager.connections.entries())
  t.equal(peerConnections.length, 0)

  await teardown(client, service, connection)
})

t.test(
  `${protocol} - should work with client using mplex muxer only`,
  async t => {
    const { awsClient } = await mockAWS(config)
    const { client, service, connection, receiver } = await setup({ protocol, awsClient, muxers: ['mplex'] })

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
    t.equal(response.blockPresences.length, 2)

    const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
    t.equal(cid1Blocks.length, 1)

    const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
    t.equal(cid2Blocks.length, 1)

    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)

t.test(
  `${protocol} - should work with client using yamux muxer only`,
  async t => {
    const { awsClient } = await mockAWS(config)
    const { client, service, connection, receiver } = await setup({ protocol, awsClient, muxers: ['yamux'] })

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
    t.equal(response.blockPresences.length, 2)

    const cid1Blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === cid1Content)
    t.equal(cid1Blocks.length, 1)

    const cid2Blocks = response.blocks.filter(b => safeGetDAGLinks(b.data)?.[0]?.Name === cid2Link)
    t.equal(cid2Blocks.length, 1)

    t.equal(getPresence(t, response, cid3).type, BlockPresence.Type.DontHave)
    t.equal(getPresence(t, response, cid4).type, BlockPresence.Type.DontHave)
  }
)
