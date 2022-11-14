
import t from 'tap'
import config from '../src/config.js'

import { searchCarInDynamoV0, searchCarInDynamoV1, fetchBlocksData, fetchBlocksInfo } from '../src/storage.js'
import { mockDynamoQuery, mockDynamoItem, mockAwsClient, createMockAgent, mockBlockInfoSource, mockBlockDataSource } from './utils/mock.js'
import { dummyLogger } from './utils/helper.js'

process.env.LOG_LEVEL = 'fatal'
process.env.AWS_REGION = 'region'

t.test('searchCarInDynamoV0', async t => {
  t.test('get result', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blockKey = 'the-key'

    mockDynamoItem({
      pool: awsClient.agent.get(awsClient.dynamoUrl),
      table: config.blocksTable,
      keyName: config.blocksTablePrimaryKey,
      key: blockKey,
      response: { cars: { L: [{ M: { car: { S: 'car-path' }, offset: { N: 1 }, length: { N: 2 } } }] } }
    })

    t.same(await searchCarInDynamoV0({ awsClient, blockKey, logger }),
      { offset: 1, length: 2, car: 'car-path' })
    t.equal(logger.messages.debug.length, 0)
    t.equal(logger.messages.error.length, 0)
  })

  t.test('fails after retries', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blockKey = 'not-a-key'

    mockDynamoItem({
      pool: awsClient.agent.get(awsClient.dynamoUrl),
      table: config.blocksTable,
      keyName: config.blocksTablePrimaryKey,
      key: blockKey,
      response: () => { throw new Error('GENERIC_ERROR') }
    })

    await t.rejects(() => searchCarInDynamoV0({
      awsClient,
      blockKey,
      logger,
      retries: 2,
      retryDelay: 10
    }), { message: 'Dynamo.GetItem' })
    t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.GetItem attempt 1 / 2')
    t.equal(logger.messages.debug[1][1], 'Cannot Dynamo.GetItem attempt 2 / 2')
    t.equal(logger.messages.error[0][1], 'Cannot Dynamo.GetItem after 2 attempts')
  })
})

t.test('searchCarInDynamoV1', async t => {
  t.test('get result', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blockKey = 'the-key'

    mockDynamoQuery({
      pool: awsClient.agent.get(awsClient.dynamoUrl),
      table: config.linkTableV1,
      keyName: config.linkTableBlockKey,
      key: blockKey,
      response: [{ offset: { N: '1' }, length: { N: '2' }, carpath: { S: 'car-path' } }]
    })

    t.same(await searchCarInDynamoV1({ awsClient, blockKey, logger }),
      { offset: 1, length: 2, car: 'car-path' })
    t.equal(logger.messages.debug.length, 0)
    t.equal(logger.messages.error.length, 0)
  })

  t.test('fails after retries', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blockKey = 'not-a-key'

    mockDynamoQuery({
      pool: awsClient.agent.get(awsClient.dynamoUrl),
      table: config.linkTableV1,
      keyName: config.linkTableBlockKey,
      key: blockKey,
      response: () => { throw new Error('GENERIC_ERROR') }
    })

    await t.rejects(() => searchCarInDynamoV1({ awsClient, blockKey, logger, retries: 2, retryDelay: 10 }), { message: 'Dynamo.Query' })
    t.equal(logger.messages.debug[0][1], 'Cannot Dynamo.Query attempt 1 / 2')
    t.equal(logger.messages.debug[1][1], 'Cannot Dynamo.Query attempt 2 / 2')
    t.equal(logger.messages.error[0][1], 'Cannot Dynamo.Query after 2 attempts')
  })

  t.test('fallback to v0', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blockKey = 'the-v0-block-key'

    mockDynamoQuery({
      pool: awsClient.agent.get(awsClient.dynamoUrl),
      table: config.linkTableV1,
      keyName: config.linkTableBlockKey,
      key: blockKey,
      response: []
    })
    mockDynamoItem({
      pool: awsClient.agent.get(awsClient.dynamoUrl),
      table: config.blocksTable,
      keyName: config.blocksTablePrimaryKey,
      key: blockKey,
      response: {
        multihash: { S: 'zQmZgTpJUbrss357x1D14Uo43JATwd7LhkZNbreqXVGFMmD' },
        cars: {
          L: [
            {
              M: {
                offset: { N: '96' },
                length: { N: '5' },
                car: { S: 'region/bucket/test-cid1.car' }
              }
            }
          ]
        }
      }
    })

    t.same(await searchCarInDynamoV1({ awsClient, blockKey, logger }), {
      offset: 96,
      length: 5,
      car: 'region/bucket/test-cid1.car'
    })
    t.equal(logger.messages.info.length, 0)
    t.equal(logger.messages.error[0][1], 'block not found in V1 table but found in V0 table')
  })
})

t.test('fetchBlocksData', async t => {
  t.test('should retrieve data blocks successfully', async t => {
    const { awsClient } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ awsClient, key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[1].key, info: { offset: 12, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 8, data: '12345678' })
    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 12, length: 2, data: 'bb' })
    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'cc' })

    await fetchBlocksData({ awsClient, blocks, logger: dummyLogger() })

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
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blocks = [{ key: '123' }, {}, { key: '789' }]

    mockBlockInfoSource({ awsClient, key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 0, length: 8, data: '12345678' })
    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'cc' })

    await fetchBlocksData({ awsClient, blocks, logger })

    t.same(blocks, [
      {
        key: '123',
        info: { offset: 0, length: 8, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('12345678'), found: true }
      },
      {},
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true },
        data: { content: Buffer.from('cc'), found: true }
      }
    ])

    t.equal(logger.messages.error[0][1], 'invalid block, missing key')
    t.equal(logger.messages.error[1][1], 'invalid block, missing key')
    t.equal(logger.messages.error.length, 2)
  })

  t.test('should get error on block length greater than max allowed', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ awsClient, key: blocks[0].key, info: { offset: 0, length: 10e9, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[1].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })
    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })

    await fetchBlocksData({ awsClient, blocks, logger })

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

    t.equal(logger.messages.error[0][0].block.key, '123')
    t.equal(logger.messages.error[0][1], 'invalid block, length is greater than max allowed')
    t.equal(logger.messages.error.length, 1)
  })

  t.test('should get not found on block non-existings blocks', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ awsClient, key: blocks[0].key, info: {} })
    mockBlockInfoSource({ awsClient, key: blocks[1].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })
    mockBlockDataSource({ awsClient, region: 'region', bucket: 'bucket', key: 'abc', offset: 14, length: 2, data: 'aa' })

    await fetchBlocksData({ awsClient, blocks, logger })

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

    t.equal(logger.messages.error.length, 0)
  })
})

t.test('fetchBlocksInfo', async t => {
  t.test('should retrieve info blocks successfully', async t => {
    const { awsClient } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ awsClient, key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[1].key, info: { offset: 12, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    await fetchBlocksInfo({ awsClient, blocks, logger: dummyLogger() })

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
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blocks = [{ key: '123' }, {}, { key: '789' }]

    mockBlockInfoSource({ awsClient, key: blocks[0].key, info: { offset: 0, length: 8, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    await fetchBlocksInfo({ awsClient, blocks, logger })

    t.same(blocks, [
      {
        key: '123',
        info: { offset: 0, length: 8, car: 'region/bucket/abc', found: true }
      },
      {},
      {
        key: '789',
        info: { offset: 14, length: 2, car: 'region/bucket/abc', found: true }
      }
    ])

    t.equal(logger.messages.error[0][1], 'invalid block, missing key')
    t.equal(logger.messages.error.length, 1)
  })

  t.test('should get not found on block non-existings blocks', async t => {
    const { awsClient, logger } = await mockAwsClient(config)
    awsClient.agent = createMockAgent()

    const blocks = [{ key: '123' }, { key: '456' }, { key: '789' }]

    mockBlockInfoSource({ awsClient, key: blocks[0].key, info: {} })
    mockBlockInfoSource({ awsClient, key: blocks[1].key, info: { offset: 214, length: 2, car: 'region/bucket/abc' } })
    mockBlockInfoSource({ awsClient, key: blocks[2].key, info: { offset: 14, length: 2, car: 'region/bucket/abc' } })

    await fetchBlocksInfo({ awsClient, blocks, logger })

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

    t.equal(logger.messages.error.length, 0)
  })
})
