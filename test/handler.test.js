'use strict'

process.env.CACHE_BLOCK_INFO = 'true'
process.env.CACHE_BLOCK_DATA = 'true'

const t = require('tap')
const sinon = require('sinon')
const { CID } = require('multiformats/cid')

const config = require('../src/config')
const { loadEsmModule } = require('../src/esm-loader')
const { BITSWAP_V_120, Entry, WantList } = require('../src/protocol')

const { handle, createContext } = require('../src/handler')
const { cidToKey } = require('../src/util')

const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('./fixtures/cids')
const helper = require('./utils/helper')
const { mockBlockInfoSource, mockBlockDataSource, createMockAgent, mockAwsClient } = require('./utils/mock')

let PQueue
t.before(async () => {
  PQueue = await loadEsmModule('p-queue')
})

async function spyContext({ blocks, protocol = BITSWAP_V_120 }) {
  const service = {
    dial: async () => ({
      newSteam: async () => ({ stream: null })
    })
  }
  const connection = {
    on: sinon.spy(),
    send: sinon.spy(),
    close: sinon.spy()
  }
  const { awsClient } = await mockAwsClient(config)
  awsClient.agent = createMockAgent()
  const context = createContext({ awsClient, service, peer: 'dummy', wantlist: new WantList(blocks), protocol, connection })
  return context
}

t.test('handle', async t => {
  t.test('should handle a request successfully', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
    const key = 'zQmZgTpJUbrss357x1D14Uo43JATwd7LhkZNbreqXVGFMmD'

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
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)

    const sent = helper.decodeMessage(connectionSpy.send.args[0][0])
    t.same(sent, {
      blocksInfo: [{ key, type: 0 }],
      blocksData: [{ cid: 'bafkreidisxbnj5j6rlsdumzjtma7r7npewzl3y3rwwchofkkcypfetzqui', data: '6162632e2e2e' }]
    })
  })

  t.test('should handle a request containing an invalid cid', async t => {
    const invalidCid = 'not-a-cid'
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
    const key = 'zQmZgTpJUbrss357x1D14Uo43JATwd7LhkZNbreqXVGFMmD'

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
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 1)
    t.equal(loggerSpy.messages.error[0][0].block.cid, 'not-a-cid')
    t.equal(loggerSpy.messages.error[0][1], 'invalid block cid')
    t.equal(loggerSpy.messages.warn.length, 0)

    t.same(helper.decodeMessage(connectionSpy.send.args[0][0]),
      { blocksInfo: [], blocksData: [{ cid: 'bafkreidisxbnj5j6rlsdumzjtma7r7npewzl3y3rwwchofkkcypfetzqui', data: '6162632e2e2e' }] }
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
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 2)
    t.equal(loggerSpy.messages.warn.length, 0)
  })

  t.test('should handle a request in multiple batches concurretly', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
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
    const queue = new PQueue({ concurrency: 3 })

    await handle({ context: contextSpy, logger: loggerSpy, processing: queue, batchSize: 1 })

    t.equal(connectionSpy.send.callCount, 8)
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)
  })

  t.test('should handle multiple requests at the same time', async t => {
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
    mockBlockInfoSource({ awsClient: contextsSpy[2].awsClient, key: cidToKey(cid5), info: { offset: 123, length: 465, car: 'region/bucket/cid5-car' } })
    mockBlockDataSource({ awsClient: contextsSpy[2].awsClient, region: 'region', bucket: 'bucket', key: 'cid8-car', offset: 1, length: 2, data: 'cid8-content' })
    mockBlockInfoSource({ awsClient: contextsSpy[2].awsClient, key: cidToKey(cid9), info: { offset: 0, length: 1, car: 'region/bucket/cid9-car' } })
    mockBlockInfoSource({ awsClient: contextsSpy[2].awsClient, key: cidToKey(cid1), info: { offset: 100, length: 128, car: 'region/bucket/cid1-car' } })
    mockBlockDataSource({ awsClient: contextsSpy[2].awsClient, region: 'region', bucket: 'bucket', key: 'cid1-car', offset: 100, length: 128, data: 'cid1-content' })

    const loggerSpy = helper.spyLogger()
    const connectionsSpy = contextsSpy.map(c => c.connection)
    const queue = new PQueue({ concurrency: 999 })

    await Promise.all(
      contextsSpy.map(context =>
        handle({ context, logger: loggerSpy, processing: queue, batchSize: 2 })))

    t.equal(connectionsSpy[0].send.callCount, 2)
    t.equal(connectionsSpy[0].close.callCount, 1)

    let sent = helper.decodeMessage(connectionsSpy[0].send.args[0][0])
    t.equal(sent.blocksInfo.length, 1)
    t.ok(sent.blocksInfo.find(b => b.key === 'zQmZgTpJUbrss357x1D14Uo43JATwd7LhkZNbreqXVGFMmD' && b.type === 0)) // cid1
    t.same(sent.blocksData, [{
      cid: 'bafybeiey33y4jzylufvxqhcjliju72wzarrovx3fpqweuqhjjfdrkklegq', // cid2
      data: '636964322d636f6e74656e74'
    }])

    sent = helper.decodeMessage(connectionsSpy[0].send.args[1][0])
    t.equal(sent.blocksInfo.length, 2)
    t.ok(sent.blocksInfo.find(b => b.key === 'zQmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D' && b.type === 1)) // cid3
    t.ok(sent.blocksInfo.find(b => b.key === 'zQmdmQXB2mzChmMeKY47C43LxUdg1NDJ5MWcKMKxDu7RgQm' && b.type === 1)) // cid4
    t.same(sent.blocksData, [])

    t.equal(connectionsSpy[1].send.callCount, 2)
    t.equal(connectionsSpy[1].close.callCount, 1)
    sent = helper.decodeMessage(connectionsSpy[1].send.args[0][0])
    t.same(sent, {
      blocksInfo: [{ key: 'zQmQ32EbNWRjYT4sLukMBL7nvcnrGv8f4Enkr4PqdQo6xRV', type: 0 }],
      blocksData: []
    })
    sent = helper.decodeMessage(connectionsSpy[1].send.args[1][0])
    t.same(sent, {
      blocksInfo: [{ key: 'zQmdmQXB2mzChmMeKY47C43LxUdg1NDJ5MWcKMKxDu7RgQm', type: 1 }],
      blocksData: [
        {
          cid: 'bafkreifgrc4fuyblvxr62zcupvlkn6kd6e463slt3bc2ykewake7mxlpk4',
          data: '636964352d636f6e74656e74'
        }
      ]
    })

    t.equal(connectionsSpy[2].send.callCount, 2)
    t.equal(connectionsSpy[2].close.callCount, 1)
    sent = helper.decodeMessage(connectionsSpy[2].send.args[0][0])
    t.same(sent, {
      blocksInfo: [{ key: 'zQmXGyrrB12PGx7wacyY9XWjA287PBUnEhrQmBurc53TxW3', type: 0 }],
      blocksData: [
        {
          cid: 'bafkreidisxbnj5j6rlsdumzjtma7r7npewzl3y3rwwchofkkcypfetzqui',
          data: '6162632e2e2e'
        }
      ]
    })
    sent = helper.decodeMessage(connectionsSpy[2].send.args[1][0])
    t.equal(sent.blocksInfo.length, 2)
    t.ok(sent.blocksInfo.find(b => b.key === 'zQmUF7AvbU5HqeSypxoqTa3rRzpViZj3YjQWPhV8ykgmpBB' && b.type === 0))
    t.ok(sent.blocksInfo.find(b => b.key === 'zQmbfSqvUycmA1zG5WAfMfCknSJwbGxDMCnaXF5BieZ7Xnz' && b.type === 1))
    t.same(sent.blocksData, [])

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
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 2)
    t.equal(loggerSpy.messages.error[1][1], 'error on handler#peerClose')
  })

  t.test('should not send a response on establishing connection to the peer and handle the error', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')

    const contextSpy = await spyContext({
      blocks: [new Entry(cid, 1, false, Entry.WantType.Have, true)]
    })
    delete contextSpy.connection
    contextSpy.service.dial = async () => { throw new Error('DIAL_CONNECTION_ERROR') }

    mockBlockInfoSource({ awsClient: contextSpy.awsClient, key: cidToKey(cid), info: { offset: 0, length: 128, car: 'region/bucket/abc' } })

    const loggerSpy = helper.spyLogger()

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(loggerSpy.messages.warn.length, 0)
    t.equal(loggerSpy.messages.error.length, 1)
    t.equal(loggerSpy.messages.error[0][1], 'error on handler#batchResponse peerConnect')
    t.equal(contextSpy.done, 0)
  })
})
