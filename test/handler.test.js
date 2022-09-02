'use strict'

process.env.CACHE_BLOCK_INFO = 'true'
process.env.CACHE_BLOCK_DATA = 'true'

const t = require('tap')
const sinon = require('sinon')
const { CID } = require('multiformats/cid')
const { loadEsmModule } = require('../src/esm-loader')
const { BITSWAP_V_120, Entry, WantList } = require('../src/protocol')

const { handle, createContext } = require('../src/handler')

const { cid1, cid2, cid3, cid4, cid5, cid6, cid7, cid8, cid9 } = require('./fixtures/cids')
const { spyLogger } = require('./utils/helpers')
const { mockBlockInfoSource, mockBlockDataSource, mockAWS } = require('./utils/mock')

let PQueue
t.before(async () => {
  PQueue = await loadEsmModule('p-queue')
})

function spyContext({ blocks, protocol = BITSWAP_V_120 }) {
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
  const context = createContext({ service, peer: 'dummy', wantlist: new WantList(blocks), protocol, connection })
  return context
}

t.test('handle', async t => {
  t.test('should handle a request successfully', async t => {
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
    const key = 'zQmZgTpJUbrss357x1D14Uo43JATwd7LhkZNbreqXVGFMmD'

    mockBlockInfoSource({ key, info: { offset: 0, length: 128, car: 'region/bucket/abc' } })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 128, data: 'abc...' })

    const contextSpy = spyContext({
      blocks: [
        new Entry(cid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true)
      ]
    })
    const loggerSpy = spyLogger()
    const connectionSpy = contextSpy.connection

    await handle({ context: contextSpy, logger: loggerSpy })

    const response = Buffer.from('0a0210011a0e0a040155122012066162632e2e2e22280a2401551220a883dafc480d466ee04e0d6da986bd78eb1fdd2178d04693723da3a8f95d42f410002800', 'hex')

    t.equal(connectionSpy.send.callCount, 1)
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)
    t.same(connectionSpy.send.args[0][0], response)
  })

  t.test('should handle a request containing an invalid cid', async t => {
    const invalidCid = 'not-a-cid'
    const cid = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
    const key = 'zQmZgTpJUbrss357x1D14Uo43JATwd7LhkZNbreqXVGFMmD'

    mockBlockInfoSource({ key, info: { offset: 0, length: 128, car: 'region/bucket/abc' } })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 128, data: 'abc...' })

    const contextSpy = spyContext({
      blocks: [
        new Entry(invalidCid, 1, false, Entry.WantType.Have, true),
        new Entry(cid, 1, false, Entry.WantType.Block, true)
      ]
    })
    const loggerSpy = spyLogger()
    const connectionSpy = contextSpy.connection

    await handle({ context: contextSpy, logger: loggerSpy })

    const response = Buffer.from('0a0210011a0e0a040155122012066162632e2e2e2800', 'hex')

    t.equal(connectionSpy.send.callCount, 1)
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 1)
    t.equal(loggerSpy.messages.error[0][0].block.cid, 'not-a-cid')
    t.equal(loggerSpy.messages.error[0][1], 'invalid block cid')
    t.equal(loggerSpy.messages.warn.length, 0)
    t.same(connectionSpy.send.args[0][0], response)
  })

  t.test('should handle a request containing only invalid blocks', async t => {
    const invalidCid = 'not-a-cid'

    const contextSpy = spyContext({
      blocks: [
        new Entry(invalidCid, 1, false, Entry.WantType.Have, true),
        new Entry(invalidCid, 1, false, Entry.WantType.Block, true)
      ]
    })
    const loggerSpy = spyLogger()
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

    mockBlockInfoSource({ key, info: { offset: 0, length: 128, car: 'region/bucket/abc' } })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 128, data: 'abc...' })

    const contextSpy = spyContext({
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
    const loggerSpy = spyLogger()
    const connectionSpy = contextSpy.connection
    const queue = new PQueue({ concurrency: 3 })

    await handle({ context: contextSpy, logger: loggerSpy, processing: queue, batchSize: 1 })

    t.equal(connectionSpy.send.callCount, 8)
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 0)
    t.equal(loggerSpy.messages.warn.length, 0)
  })

  t.todo('should handle multiple requests at the same time', async t => {
    mockAWS()
    const contextsSpy = [
      spyContext({
        blocks: [
          new Entry(cid1, 1, false, Entry.WantType.Have, true),
          new Entry(cid2, 1, false, Entry.WantType.Block, true),
          new Entry(cid3, 1, false, Entry.WantType.Have, true),
          new Entry(cid4, 1, false, Entry.WantType.Block, true)
        ]
      }),
      spyContext({
        blocks: [
          new Entry(cid4, 1, false, Entry.WantType.Have, true),
          new Entry(cid5, 1, false, Entry.WantType.Block, true),
          new Entry(cid6, 1, false, Entry.WantType.Have, true)
        ]
      }),
      spyContext({
        blocks: [
          new Entry(cid7, 1, false, Entry.WantType.Have, true),
          new Entry(cid8, 1, false, Entry.WantType.Block, true),
          new Entry(cid9, 1, false, Entry.WantType.Have, true),
          new Entry(cid1, 1, false, Entry.WantType.Block, true)
        ]
      })
    ]

    const loggerSpy = spyLogger()
    const connectionsSpy = contextsSpy.map(c => c.connection)
    const queue = new PQueue({ concurrency: 3 })

    await Promise.all(contextsSpy.map(context => handle({ context, logger: loggerSpy, processing: queue, batchSize: 2 })))

    // TODO assertions

    // t.equal(connectionsSpy[0].send.callCount, 8)
    // t.equal(connectionsSpy[0].close.callCount, 1)
    // t.same(connectionsSpy[0].send.args[0][0], response)

    // t.equal(connectionsSpy[1].send.callCount, 8)
    // t.equal(connectionsSpy[1].close.callCount, 1)
    // t.same(connectionsSpy[0].send.args[0][0], response)

    // t.equal(connectionsSpy[2].send.callCount, 8)
    // t.equal(connectionsSpy[2].close.callCount, 1)
    // t.same(connectionsSpy[0].send.args[0][0], response)

  // t.equal(loggerSpy.messages.error.length, 0)
  // t.equal(loggerSpy.messages.warn.length, 0)
  })

  t.test('should handle and empty request', async t => {
    const contextSpy = spyContext({ blocks: [] })
    const loggerSpy = spyLogger()
    const connectionSpy = contextSpy.connection
    connectionSpy.close = sinon.stub().throws()

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(connectionSpy.send.callCount, 0)
    t.equal(connectionSpy.close.callCount, 0)
    t.equal(loggerSpy.messages.error.length, 0)
  })

  t.test('should get error on connection closing error', async t => {
    const contextSpy = spyContext({ blocks: [new Entry('not-a-cid', 1, false, Entry.WantType.Have, true)] })
    const loggerSpy = spyLogger()
    const connectionSpy = contextSpy.connection
    connectionSpy.close = sinon.stub().throws()

    await handle({ context: contextSpy, logger: loggerSpy })

    t.equal(connectionSpy.send.callCount, 0)
    t.equal(connectionSpy.close.callCount, 1)
    t.equal(loggerSpy.messages.error.length, 2)
    t.equal(loggerSpy.messages.error[1][1], 'error on handler#peerClose')
  })
})
