'use strict'

process.env.CACHE_BLOCK_INFO = 'true'
process.env.CACHE_BLOCK_DATA = 'true'

const t = require('tap')
const sinon = require('sinon')
const { CID } = require('multiformats/cid')

const config = require('../src/config')
const { BITSWAP_V_120, Entry, WantList } = require('../src/protocol')

const { handle, createContext } = require('../src/handler')
const { cidToKey } = require('../src/util')

const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('./fixtures/cids')
const helper = require('./utils/helper')
const { mockBlockInfoSource, mockBlockDataSource, createMockAgent, mockAwsClient } = require('./utils/mock')

function dummyPeer(id = 'the-dummy-peer-id') {
  return { _idB58String: id }
}

async function spyContext({ blocks, protocol = BITSWAP_V_120, peerId }) {
  const service = {
    dial: async () => ({
      newStream: async () => ({ stream: null })
    })
  }
  const connectionSpy = {
    on: sinon.spy(),
    send: sinon.spy(),
    close: sinon.spy(),
    removeAllListeners: sinon.spy()
  }
  const peer = peerId || dummyPeer()

  const { awsClient } = await mockAwsClient(config)
  awsClient.agent = createMockAgent()
  const context = createContext({ awsClient, service, peerId: peer, wantlist: new WantList(blocks), protocol, connection: connectionSpy })
  return context
}

t.test('handle', async t => {
  t.test('should handle a request successfully', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkcxy')
    const key = cidToKey(cid)

    const contextSpy = await spyContext({
      blocks: [
        new Entry(cid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true)
      ]
    })
    mockBlockInfoSource({ awsClient: contextSpy.awsClient, key, info: { offset: 0, length: 128, car: 'region/bucket/abc' }, times: 2 })
    mockBlockDataSource({ awsClient: contextSpy.awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 128, data: 'abc...' })

    const loggerSpy = helper.spyLogger()
    const connectionSpy = contextSpy.connection

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(connectionSpy.send.callCount, 1)
    t.equal(connectionSpy.close.callCount, 1, 'should close the peer connection')
    t.equal(loggerSpy.messages.error.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)

    const sent = helper.decodeMessage(connectionSpy.send.args[0][0])
    t.same(sent, {
      blocksInfo: [{ key, type: 0 }],
      blocksData: [{ cid: 'bafkreidisxbnj5j6rlsdumzjtma7r7npewzl3y3rwwchofkkcypfetzqui', data: 'abc...' }]
    })
  })

  t.test('should handle a request containing an invalid cid', async t => {
    const invalidCid = 'not-a-cid'
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkcxy')
    const key = cidToKey(cid)

    const contextSpy = await spyContext({
      blocks: [
        new Entry(invalidCid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true)
      ]
    })
    mockBlockInfoSource({ awsClient: contextSpy.awsClient, key, info: { offset: 0, length: 128, car: 'region/bucket/abc' } })
    mockBlockDataSource({ awsClient: contextSpy.awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 128, data: 'abc...' })

    const loggerSpy = helper.spyLogger()
    const connectionSpy = contextSpy.connection

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(connectionSpy.send.callCount, 1)
    t.equal(connectionSpy.close.callCount, 1, 'should close the peer connection')
    t.equal(loggerSpy.messages.error.length, 1)
    t.equal(loggerSpy.messages.error[0][0].block.cid, 'not-a-cid')
    t.equal(loggerSpy.messages.error[0][1], 'invalid block cid')
    t.equal(loggerSpy.messages.warn.length, 0)

    t.same(helper.decodeMessage(connectionSpy.send.args[0][0]),
      { blocksInfo: [], blocksData: [{ cid: 'bafkreidisxbnj5j6rlsdumzjtma7r7npewzl3y3rwwchofkkcypfetzqui', data: 'abc...' }] }
    )
  })

  t.test('should handle a request containing only invalid blocks', async t => {
    const invalidCid = 'not-a-cid'

    const contextSpy = await spyContext({
      blocks: [
        new Entry(invalidCid, 1, false, Entry.WantType.Have, true),
        new Entry(invalidCid, 1, false, Entry.WantType.Block, true)
      ]
    })
    const loggerSpy = helper.spyLogger()
    const connectionSpy = contextSpy.connection

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(connectionSpy.send.callCount, 0)
    t.equal(connectionSpy.close.callCount, 1, 'should close the peer connection')
    t.equal(loggerSpy.messages.error.length, 2)
    t.equal(loggerSpy.messages.warn.length, 0)
  })

  t.test('should handle a request in multiple batches concurretly', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkcxy')
    const key = 'zQmZgTpJUbrss357x1D14Uo43JATwd7LhkZNbreqXVGFMmD'

    const contextSpy = await spyContext({
      blocks: [
        new Entry(cid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true),
        new Entry(cid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true),
        new Entry(cid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true),
        new Entry(cid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true)
      ]
    })
    mockBlockInfoSource({ awsClient: contextSpy.awsClient, key, info: { offset: 0, length: 128, car: 'region/bucket/abc' } })
    mockBlockDataSource({ awsClient: contextSpy.awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 128, data: 'abc...' })

    const loggerSpy = helper.spyLogger()
    const connectionSpy = contextSpy.connection

    await handle({ context: contextSpy, logger: loggerSpy, batchSize: 1 })

    t.equal(connectionSpy.send.callCount, 8)
    t.equal(connectionSpy.close.callCount, 1, 'should close the peer connection')
    t.equal(loggerSpy.messages.error.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)
  })

  t.test('should handle multiple requests at the same time on the same peer', async t => {
    const contextsSpy = [
      await spyContext({
        blocks: [
          new Entry(cid1, 1, false, Entry.WantType.Have, true),
          new Entry(cid2, 1, false, Entry.WantType.Block, true),
          new Entry(cid3, 1, false, Entry.WantType.Have, true), // not found
          new Entry(cid4, 1, false, Entry.WantType.Block, true), // not found
          new Entry('not-a-cid', 1, false, Entry.WantType.Block, true)
        ]
      }),
      await spyContext({
        blocks: [
          new Entry(cid4, 1, false, Entry.WantType.Have, true), // not found
          new Entry(cid5, 1, false, Entry.WantType.Block, true),
          new Entry(cid6, 1, false, Entry.WantType.Have, true),
          new Entry('not-a-cid', 1, false, Entry.WantType.Have, true)
        ]
      }),
      await spyContext({
        blocks: [
          new Entry(cid7, 1, false, Entry.WantType.Have, true),
          new Entry(cid8, 1, false, Entry.WantType.Block, true),
          new Entry(cid9, 1, false, Entry.WantType.Have, true),
          new Entry(cid1, 1, false, Entry.WantType.Block, true),
          new Entry(cid1, 1, true, Entry.WantType.Block, true) // canceled
        ]
      })
    ]

    mockBlockInfoSource({ awsClient: contextsSpy[0].awsClient, key: cidToKey(cid1), info: { offset: 0, length: 128, car: 'region/bucket/cid1-car' } })
    mockBlockInfoSource({ awsClient: contextsSpy[0].awsClient, key: cidToKey(cid2), info: { offset: 100, length: 128, car: 'region/bucket/cid2-car' } })
    mockBlockDataSource({ awsClient: contextsSpy[0].awsClient, region: 'region', bucket: 'bucket', key: 'cid2-car', offset: 100, length: 128, data: 'cid2-content' })

    mockBlockInfoSource({ awsClient: contextsSpy[1].awsClient, key: cidToKey(cid5), info: { offset: 123, length: 465, car: 'region/bucket/cid5-car' } })
    mockBlockDataSource({ awsClient: contextsSpy[1].awsClient, region: 'region', bucket: 'bucket', key: 'cid5-car', offset: 123, length: 456, data: 'cid5-content' })
    mockBlockInfoSource({ awsClient: contextsSpy[1].awsClient, key: cidToKey(cid6), info: { offset: 0, length: 128, car: 'region/bucket/cid6-car' } })

    mockBlockInfoSource({ awsClient: contextsSpy[2].awsClient, key: cidToKey(cid7), info: { offset: 0, length: 1, car: 'region/bucket/cid7-car' } })
    mockBlockInfoSource({ awsClient: contextsSpy[2].awsClient, key: cidToKey(cid8), info: { offset: 1, length: 2, car: 'region/bucket/cid8-car' } })
    mockBlockDataSource({ awsClient: contextsSpy[2].awsClient, region: 'region', bucket: 'bucket', key: 'cid8-car', offset: 1, length: 2, data: 'cid8-content' })
    mockBlockInfoSource({ awsClient: contextsSpy[2].awsClient, key: cidToKey(cid9), info: { offset: 0, length: 1, car: 'region/bucket/cid9-car' } })
    mockBlockInfoSource({ awsClient: contextsSpy[2].awsClient, key: cidToKey(cid1), info: { offset: 100, length: 128, car: 'region/bucket/cid1-car' } })
    mockBlockDataSource({ awsClient: contextsSpy[2].awsClient, region: 'region', bucket: 'bucket', key: 'cid1-car', offset: 100, length: 128, data: 'cid1-content' })

    const loggerSpy = helper.spyLogger()
    const connectionsSpy = contextsSpy.map(c => c.connection)

    await Promise.all(
      contextsSpy.map(context =>
        handle({ context, logger: loggerSpy, batchSize: 2 })))

    t.equal(connectionsSpy[0].send.callCount, 2)
    t.equal(connectionsSpy[0].close.callCount, 1, 'should close the peer connection')

    // TODO fix response order is not strict, next assertions may fails because of response order

    // first response

    let sent = helper.decodeMessage(connectionsSpy[0].send.args[0][0])
    t.equal(sent.blocksInfo.length, 1)
    t.ok(sent.blocksInfo.find(b => b.key === cidToKey(cid1) && b.type === 0)) // cid1 found
    t.same(sent.blocksData, [{
      cid: 'bafybeiey33y4jzylufvxqhcjliju72wzarrovx3fpqweuqhjjfdrkklegq', // cid2 data
      data: 'cid2-content'
    }])

    sent = helper.decodeMessage(connectionsSpy[0].send.args[1][0])
    t.equal(sent.blocksInfo.length, 2)
    t.ok(sent.blocksInfo.find(b => b.key === cidToKey(cid3) && b.type === 1)) // cid3 not found
    t.ok(sent.blocksInfo.find(b => b.key === cidToKey(cid4) && b.type === 1)) // cid4 not found
    t.same(sent.blocksData, [])

    // second response

    t.equal(connectionsSpy[1].send.callCount, 2)
    t.equal(connectionsSpy[1].close.callCount, 1, 'should close the peer connection')
    sent = helper.decodeMessage(connectionsSpy[1].send.args[0][0])
    t.same(sent, {
      blocksInfo: [{ key: cidToKey(cid6), type: 0 }], // cid6 found
      blocksData: []
    })
    sent = helper.decodeMessage(connectionsSpy[1].send.args[1][0])
    t.same(sent, {
      blocksInfo: [{ key: cidToKey(cid4), type: 1 }], // cid4 not found
      blocksData: [
        {
          cid: 'bafkreifgrc4fuyblvxr62zcupvlkn6kd6e463slt3bc2ykewake7mxlpk4', // cid5 data
          data: 'cid5-content'
        }
      ]
    })

    // third response

    t.equal(connectionsSpy[2].send.callCount, 2)
    t.equal(connectionsSpy[2].close.callCount, 1, 'should close the peer connection')
    sent = helper.decodeMessage(connectionsSpy[2].send.args[0][0])
    t.same(sent, {
      blocksInfo: [{ key: cidToKey(cid7), type: 0 }], // cid7 found
      blocksData: [
        {
          cid: 'bafkreihtgll4nt4euynqnkjrg3vclmmmvo7srby4qul6pc4uiiayorplmu', // cid8 data
          data: 'cid8-content'
        }
      ]
    })
    sent = helper.decodeMessage(connectionsSpy[2].send.args[1][0])
    t.same(sent, {
      blocksInfo: [{ key: cidToKey(cid9), type: 0 }], // cid9 found
      blocksData: [
        {
          cid: 'bafkreia6rl74tk7lwetxgol4pjbknva4474ecxkx7vlhviz7xpsfascqhu', // cid1 data
          data: 'cid1-content'
        }
      ]
    })

    t.equal(loggerSpy.messages.error.length, 2)
    t.equal(loggerSpy.messages.error[0][1], 'invalid block cid')
    t.equal(loggerSpy.messages.error[1][1], 'invalid block cid')
    t.equal(loggerSpy.messages.warn.length, 0)
  })

  t.test('should handle and empty request', async t => {
    const contextSpy = await spyContext({ blocks: [] })
    const loggerSpy = helper.spyLogger()
    const connectionSpy = contextSpy.connection
    connectionSpy.close = sinon.stub().throws()

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(connectionSpy.send.callCount, 0)
    t.equal(connectionSpy.close.callCount, 0)
    t.equal(loggerSpy.messages.error.length, 0)
  })

  t.test('should get log error on connection closing error', async t => {
    const contextSpy = await spyContext({ blocks: [new Entry('not-a-cid', 1, false, Entry.WantType.Have, true)] })
    const loggerSpy = helper.spyLogger()
    const connectionSpy = contextSpy.connection
    connectionSpy.close = sinon.stub().throws()

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(connectionSpy.send.callCount, 0)
    t.equal(connectionSpy.close.callCount, 1, 'should close the peer connection')
    t.equal(loggerSpy.messages.error.length, 2)
    t.equal(loggerSpy.messages.error[0][1], 'invalid block cid')
    t.equal(loggerSpy.messages.error[1][1], 'error on close connection handler#endResponse')
  })

  t.test('should not send a response without connecting to the peer and handle the error - cant acquire stream', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkcxy')

    const contextSpy = await spyContext({
      blocks: [new Entry(cid, 1, false, Entry.WantType.Have, true)]
    })
    delete contextSpy.connection
    delete contextSpy.connecting
    contextSpy.service.dial = async () => { throw new Error('DIAL_CONNECTION_ERROR') }

    mockBlockInfoSource({ awsClient: contextSpy.awsClient, key: cidToKey(cid), info: { offset: 0, length: 128, car: 'region/bucket/abc' } })

    const loggerSpy = helper.spyLogger()

    await handle({ context: contextSpy, logger: loggerSpy })

    t.ok(contextSpy.connection === undefined)
    t.type(contextSpy.connecting, 'Promise')
    t.equal(contextSpy.state, 'end')
    t.equal(loggerSpy.messages.warn.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)
    t.equal(loggerSpy.messages.error.length, 1)
    t.equal(loggerSpy.messages.error[0][1], 'outgoing connection error, unable to connect to peer')
    t.equal(contextSpy.done, 0)
  })

  t.test('should not send a response without connecting to the peer and handle the error - error on stream connection', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkcxy')

    const contextSpy = await spyContext({
      blocks: [new Entry(cid, 1, false, Entry.WantType.Have, true)]
    })
    delete contextSpy.connection
    delete contextSpy.connecting
    contextSpy.service.dial = async () => ({
      newStream: async () => ({ stream: 'invalid-stream-makes-connection-class-fail' })
    })

    mockBlockInfoSource({ awsClient: contextSpy.awsClient, key: cidToKey(cid), info: { offset: 0, length: 128, car: 'region/bucket/abc' } })

    const loggerSpy = helper.spyLogger()

    await handle({ context: contextSpy, logger: loggerSpy })

    t.type(contextSpy.connecting, 'Promise')
    t.equal(contextSpy.state, 'end')
    t.equal(loggerSpy.messages.warn.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)
    t.equal(loggerSpy.messages.error.length, 0)
  })

  // !TODO error on batchResponse after a few batches
  // !TODO error on batchFetch after a few batches
})
