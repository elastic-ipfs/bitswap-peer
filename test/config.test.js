'use strict'

process.env.ENV_FILE_PATH = '/dev/null'

process.env.AWS_ACCESS_KEY_ID = 'FOO'
process.env.AWS_REGION = 'us-west-2'
process.env.AWS_SECRET_ACCESS_KEY = 'BAR'
process.env.LOG_LEVEL = 'error'
process.env.NODE_DEBUG = 'bitswap-peer'
process.env.PEER_ID_FILE = 'peerId.json'
process.env.PEER_ID_S3_BUCKET = 'idBucket'
process.env.PORT = '3000'
process.env.HTTP_PORT = '3001'

const { readFile } = require('fs/promises')
const { Readable } = require('stream')
const { resolve } = require('path')
const { createFromJSON } = require('peer-id')
const t = require('tap')

const config = require('../src/config')
const { getPeerId } = require('../src/peer-id')
const { mockS3GetObject } = require('./utils/mock')

t.test('config - download the peerId from S3', async t => {
  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'), 'utf-8')
  const response = new Readable()
  response.push(rawPeer)
  response.push(null)

  mockS3GetObject({ bucket: 'idBucket', key: 'peerId.json', response })

  t.equal((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - creates a new PeerId if download fails', async t => {
  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))
  const response = new Readable()
  response.push('INVALID-JSON')
  response.push(null)

  mockS3GetObject({ bucket: 'idBucket', key: 'peerId.json', response })

  t.not((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - defaults', async t => {
  t.same(config, {
    maxBlockDataSize: 2097152,
    maxMessageSize: 4194304,
    processingQueueConcurrency: 32,
    blocksBatchSize: 32,
    blocksTable: 'blocks',
    cacheBlockInfo: false,
    cacheBlockInfoSize: 10000,
    cacheBlockData: false,
    cacheBlockDataSize: 1000,
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
    peerIdJsonFile: 'peerId.json',
    peerIdJsonPath: '/tmp/peerId.json',
    peerAnnounceAddr: undefined,
    port: 3000,
    httpPort: 3001,
    dynamoMaxRetries: 3,
    dynamoRetryDelay: 100,
    s3MaxRetries: 3,
    s3RetryDelay: 100
  })
})
