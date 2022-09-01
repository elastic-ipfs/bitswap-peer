'use strict'

process.env.CACHE_BLOCK_INFO = 'true'
process.env.CACHE_BLOCK_DATA = 'true'

const t = require('tap')

const { fetchBlocksData, fetchBlocksInfo, blockDataCache, blockInfoCache } = require('../src/storage')
const { mockBlockInfoSource, mockBlockDataSource } = require('./utils/mock')
const { dummyLogger } = require('./utils/helpers')

t.test('fetchBlocksData', async t => {
  t.test('should use cache for data blocks', async t => {
    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[1].key, info: { offset: 12, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 8, data: '12345678' })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 12, length: 2, data: 'bb' })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'cc' })

    blockDataCache.clear()
    await fetchBlocksData({ blocks, logger: dummyLogger() })

    t.same(blocks, [
      {
        key: '123',
        info: { offset: 0, length: 8, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('12345678'), found: true }
      },
      {
        key: '456',
        info: { offset: 12, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('bb'), found: true }
      },
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('cc'), found: true }
      }
    ])

    await fetchBlocksData({ blocks, logger: dummyLogger() })
    t.same(blockDataCache.get(blocks[0].key + '-' + blocks[0].info.offset + '-' + blocks[0].info.length), Buffer.from('12345678'))
    t.same(blockDataCache.get(blocks[1].key + '-' + blocks[1].info.offset + '-' + blocks[1].info.length), Buffer.from('bb'))
    t.same(blockDataCache.get(blocks[2].key + '-' + blocks[2].info.offset + '-' + blocks[2].info.length), Buffer.from('cc'))
  })
})

t.test('fetchBlocksInfo', async t => {
  t.test('should use cache for info blocks', async t => {
    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[1].key, info: { offset: 12, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/xyz' } })

    blockInfoCache.clear()
    await fetchBlocksInfo({ blocks, logger: dummyLogger() })

    t.same(blocks, [
      {
        key: '123',
        info: { offset: 0, length: 8, car: 'region/bucket/abc', found: true }
      },
      {
        key: '456',
        info: { offset: 12, length: 2, car: 'region/bucket/abc', found: true }
      },
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/xyz', found: true }
      }
    ])

    await fetchBlocksInfo({ blocks, logger: dummyLogger() })
    t.same(blockInfoCache.get(blocks[0].key), { offset: 0, length: 8, car: 'region/bucket/abc' })
    t.same(blockInfoCache.get(blocks[1].key), { offset: 12, length: 2, car: 'region/bucket/abc' })
    t.same(blockInfoCache.get(blocks[2].key), { offset: 14, length: 2, car: 'region/bucket/xyz' })
  })
})
