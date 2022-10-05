'use strict'

const t = require('tap')

const config = require('../src/config')

t.test('config - defaults', async t => {
  t.same(config, {
    maxBlockDataSize: 2097152,
    maxMessageSize: 4194304,
    processingQueueConcurrency: 256,
    blocksBatchSize: 8,
    blocksTable: 'blocks',
    cacheBlockInfo: false,
    cacheBlockInfoSize: 1000,
    cacheBlockData: false,
    cacheBlockDataSize: 1000,
    dynamoRegion: 'region-test',
    carsTable: 'cars',
    blocksTableV1: 'v1-blocks',
    carsTableV1: 'v1-cars',
    linkTableV1: 'v1-blocks-cars-position',
    blocksTablePrimaryKey: 'multihash',
    carsTablePrimaryKey: 'path',
    linkTableBlockKey: 'blockmultihash',
    linkTableCarKey: 'carpath',
    enableKeepAlive: 'true',
    pingPeriodSecs: 10,
    awsClientRefreshCredentialsInterval: 3000000,
    awsClientKeepAliveTimeout: 60000,
    awsClientConnectTimeout: 120000,
    awsClientConcurrency: 128,
    awsClientPipelining: 8,
    awsRoleSessionName: 'bitswap-peer',
    peerIdJsonFile: undefined,
    peerIdJsonPath: '/tmp/peerId.json',
    peerIdS3Bucket: undefined,
    peerIdS3Region: 'region-test',
    peerAnnounceAddr: undefined,
    port: 3000,
    httpPort: 3001,
    dynamoMaxRetries: 3,
    dynamoRetryDelay: 50,
    s3MaxRetries: 3,
    s3RetryDelay: 50,
    allowInspection: false
  })
})
