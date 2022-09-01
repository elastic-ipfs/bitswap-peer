'use strict'

process.env.LOG_LEVEL = 'fatal'

const t = require('tap')
const { Readable } = require('stream')
const config = require('../src/config')

const { fetchS3, searchCarInDynamoV0, searchCarInDynamoV1, fetchBlocksData, fetchBlocksInfo } = require('../src/storage')
const { mockDynamoGetItemCommand, mockDynamoQueryCommand, mockS3GetObject, mockBlockInfoSource, mockBlockDataSource } = require('./utils/mock')
const { dummyLogger, spyLogger } = require('./utils/helpers')

t.test('searchCarInDynamoV0', async t => {
  t.test('get result', async t => {
    const blockKey = 'the-key'

    mockDynamoGetItemCommand({
      table: config.blocksTable,
      keyName: config.blocksTablePrimaryKey,
      keyValue: blockKey,
      response: { cars: { L: [{ M: { car: { S: 'car-path' }, offset: { N: 1 }, length: { N: 2 } } }] } }
    })

    const messages = { debug: [], error: [] }
    const loggerSpy = {
      debug: (_, message) => messages.debug.push(message),
      error: (_, message) => messages.error.push(message)
    }

    t.same(await searchCarInDynamoV0({ blockKey, logger: loggerSpy }),
      { offset: 1, length: 2, car: 'car-path' })
    t.equal(messages.debug.length, 0)
    t.equal(messages.error.length, 0)
  })

  t.test('fails after retries', async t => {
    const blockKey = 'not-a-key'

    mockDynamoGetItemCommand({
      table: config.blocksTable,
      keyName: config.blocksTablePrimaryKey,
      keyValue: blockKey,
      response: () => { throw new Error('GENERIC_ERROR') }
    })
    const messages = { debug: [], error: [] }
    const loggerSpy = {
      debug: (_, message) => messages.debug.push(message),
      error: (_, message) => messages.error.push(message)
    }

    await t.rejects(() => searchCarInDynamoV0({
      blockKey,
      logger: loggerSpy,
      retries: 2,
      retryDelay: 10
    }), { message: 'Cannot send command to DynamoDB' })
    t.equal(messages.debug[0], 'DynamoDB Error, attempt 1 / 2')
    t.equal(messages.debug[1], 'DynamoDB Error, attempt 2 / 2')
    t.equal(messages.error[0], 'Cannot send command to DynamoDB after 2 attempts')
  })
})

t.test('searchCarInDynamoV1', async t => {
  t.test('get result', async t => {
    const blockKey = 'the-key'

    mockDynamoQueryCommand({
      table: config.linkTableV1,
      keyName: config.linkTableBlockKey,
      keyValue: blockKey,
      response: [{ offset: { N: '1' }, length: { N: '2' }, carpath: { S: 'car-path' } }]
    })

    const messages = { debug: [], error: [] }
    const loggerSpy = {
      debug: (_, message) => messages.debug.push(message),
      error: (_, message) => messages.error.push(message)
    }

    t.same(await searchCarInDynamoV1({ blockKey, logger: loggerSpy }),
      { offset: 1, length: 2, car: 'car-path' })
    t.equal(messages.debug.length, 0)
    t.equal(messages.error.length, 0)
  })

  t.test('fails after retries', async t => {
    const blockKey = 'not-a-key'

    mockDynamoQueryCommand({
      table: config.linkTableV1,
      keyName: config.linkTableBlockKey,
      keyValue: blockKey,
      response: () => { throw new Error('GENERIC_ERROR') }
    })

    const messages = { debug: [], error: [] }
    const loggerSpy = {
      debug: (_, message) => messages.debug.push(message),
      error: (_, message) => messages.error.push(message)
    }

    await t.rejects(() => searchCarInDynamoV1({ blockKey, logger: loggerSpy, retries: 2, retryDelay: 10 }), { message: 'Cannot send command to DynamoDB' })
    t.equal(messages.debug[0], 'DynamoDB Error, attempt 1 / 2')
    t.equal(messages.debug[1], 'DynamoDB Error, attempt 2 / 2')
    t.equal(messages.error[0], 'Cannot send command to DynamoDB after 2 attempts')
  })

  t.test('fallback to v0', async t => {
    const blockKey = 'the-v0-block-key'

    mockDynamoQueryCommand({
      table: config.linkTableV1,
      keyName: config.linkTableBlockKey,
      keyValue: blockKey,
      response: []
    })
    mockDynamoGetItemCommand({
      table: config.blocksTable,
      keyName: config.blocksTablePrimaryKey,
      keyValue: blockKey,
      response: require('./fixtures/blocks/db-v0/cid1.json')
    })

    const messages = { debug: [], info: [], error: [] }
    const loggerSpy = {
      debug: (_, message) => messages.debug.push(message),
      info: (_, message) => messages.info.push(message),
      error: (_, message) => messages.error.push(message)
    }

    t.same(await searchCarInDynamoV1({ blockKey, logger: loggerSpy }), {
      offset: 96,
      length: 5,
      car: '{AWS_REGION}/test-cars/test-cid1.car'
    })
    t.equal(messages.info.length, 0)
    t.equal(messages.error[0], 'block not found in V1 table but found in V0 table')
  })
})

t.test('fetchS3', async t => {
  t.test('fetch from S3', async t => {
    const response = new Readable()
    response.push('content')
    response.push(null)
    mockS3GetObject({ bucket: 'the-bucket', key: 'the-key', offset: 12345, length: 56789, response })

    const content = await fetchS3({ region: 'the-region', bucket: 'the-bucket', key: 'the-key', offset: 12345, length: 56789 })

    t.same(content.toString(), 'content')
  })

  t.test('fetch a block with length zero and get error', async t => {
    const messages = { warn: [] }
    const loggerSpy = {
      warn: (...args) => messages.warn.push(args)
    }

    const empty = await fetchS3({ key: 'key', length: 0, logger: loggerSpy })
    t.ok(Buffer.isBuffer(empty))
    t.equal(empty.length, 0)
    t.same(messages.warn[0], [{ key: 'key' }, 'Called fetch S3 with length 0'])
  })

  t.test('error handling, s3 request fails after all retries', async t => {
    const response = () => { throw new Error('GENERIC_ERROR') }
    mockS3GetObject({ bucket: 'the-bucket', key: 'the-key', response })
    const messages = { debug: [], error: [] }
    const loggerSpy = {
      debug: (_, message) => messages.debug.push(message),
      error: (_, message) => messages.error.push(message)
    }

    await t.rejects(
      () => fetchS3({ region: 'the-region', bucket: 'the-bucket', key: 'the-key', retries: 2, retryDelay: 10, logger: loggerSpy }),
      { message: 'GENERIC_ERROR' }
    )

    t.equal(messages.debug[0], 'S3 Error Error: "GENERIC_ERROR" attempt 1 / 2')
    t.equal(messages.debug[1], 'S3 Error Error: "GENERIC_ERROR" attempt 2 / 2')
    t.equal(messages.error[0], 'Cannot open file S3 after 2 attempts')
  })

  t.test('error handling, s3 request fails because of not found', async t => {
    const response = () => {
      const error = new Error('NOT_FOUND')
      error.code = 'NoSuchKey'
      throw error
    }
    mockS3GetObject({ bucket: 'the-bucket', key: 'the-key', response })
    const messages = { debug: [], error: [] }
    const loggerSpy = {
      debug: (_, message) => messages.debug.push(message),
      error: (_, message) => messages.error.push(message)
    }

    await t.rejects(
      () => fetchS3({ region: 'the-region', bucket: 'the-bucket', key: 'the-key', retries: 2, retryDelay: 10, logger: loggerSpy }),
      { message: 'NOT_FOUND' }
    )

    t.equal(messages.debug.length, 0)
    t.same(messages.error, ['S3 does not exists'])
  })
})

t.test('fetchBlocksData', async t => {
  t.test('should retrieve data blocks successfully', async t => {
    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[1].key, info: { offset: 12, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 8, data: '12345678' })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 12, length: 2, data: 'bb' })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'cc' })

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
  })

  t.test('should get error on block without key', async t => {
    const blocks = [{ key: '123' }, { }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 8, data: '12345678' })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'cc' })

    const spy = spyLogger()
    await fetchBlocksData({ blocks, logger: spy })

    t.same(blocks, [
      {
        key: '123',
        info: { offset: 0, length: 8, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('12345678'), found: true }
      },
      { },
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('cc'), found: true }
      }
    ])

    t.equal(spy.messages.error[0][1], 'invalid block, missing key')
    t.equal(spy.messages.error[1][1], 'invalid block, missing key')
    t.equal(spy.messages.error.length, 2)
  })

  t.test('should get error on block length greater than max allowed', async t => {
    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { offset: 0, length: 10e9, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[1].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })

    const spy = spyLogger()
    await fetchBlocksData({ blocks, logger: spy })

    t.same(blocks, [
      {
        key: '123',
        info: { offset: 0, length: 10e9, car: 'region/bucket/abc', found: true },
        data: { notFound: true }
      },
      {
        key: '456',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('aa'), found: true }
      },
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('aa'), found: true }
      }
    ])

    t.equal(spy.messages.error[0][0].block.key, '123')
    t.equal(spy.messages.error[0][1], 'invalid block, length is greater than max allowed')
    t.equal(spy.messages.error.length, 1)
  })

  t.test('should get not found on block non-existings blocks', async t => {
    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { } })
    mockBlockInfoSource({ key: blocks[1].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })
    mockBlockDataSource({ region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })

    const spy = spyLogger()
    await fetchBlocksData({ blocks, logger: spy })

    t.same(blocks, [
      {
        key: '123',
        info: { notFound: true },
        data: { notFound: true }
      },
      {
        key: '456',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('aa'), found: true }
      },
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('aa'), found: true }
      }
    ])

    t.equal(spy.messages.error.length, 0)
  })
})

t.test('fetchBlocksInfo', async t => {
  t.test('should retrieve info blocks successfully', async t => {
    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[1].key, info: { offset: 12, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

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
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true }
      }
    ])
  })

  t.test('should get error on block without key', async t => {
    const blocks = [{ key: '123' }, { }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    const spy = spyLogger()
    await fetchBlocksInfo({ blocks, logger: spy })

    t.same(blocks, [
      {
        key: '123',
        info: { offset: 0, length: 8, car: 'region/bucket/abc', found: true }
      },
      { },
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true }
      }
    ])

    t.equal(spy.messages.error[0][1], 'invalid block, missing key')
    t.equal(spy.messages.error.length, 1)
  })

  t.test('should get not found on block non-existings blocks', async t => {
    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ key: blocks[0].key, info: { } })
    mockBlockInfoSource({ key: blocks[1].key, info: { offset: 214, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    const spy = spyLogger()
    await fetchBlocksInfo({ blocks, logger: spy })

    t.same(blocks, [
      {
        key: '123',
        info: { notFound: true }
      },
      {
        key: '456',
        info: { offset: 214, length: 2, car: 'region/bucket/abc', found: true }
      },
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true }
      }
    ])

    t.equal(spy.messages.error.length, 0)
  })
})
