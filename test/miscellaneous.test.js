'use strict'

process.env.ENV_FILE_PATH = '/dev/null'
process.env.LOG_LEVEL = 'error'
process.env.NODE_DEBUG = 'aws-ipfs-bitswap-peer'
process.env.PEER_ID_S3_BUCKET = 'idBucket'

const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { readFile } = require('fs/promises')
const { resolve } = require('path')
const { createFromJSON } = require('peer-id')
const { Readable } = require('stream')
const t = require('tap')
const { getPeerId, concurrency, blocksTable, carsTable, port, telemetryPort } = require('../src/config')
const { serializeError } = require('../src/logging')
const { s3Mock } = require('./utils/mock')

t.test('config - download the peerId from S3', async t => {
  t.plan(3)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from(rawPeer) }
  })

  t.equal((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - creates a new PeerId if download fails', async t => {
  t.plan(3)

  const rawPeer = await readFile(resolve(process.cwd(), 'test/fixtures/peerId.json'))

  s3Mock.on(GetObjectCommand).callsFake(async params => {
    t.equal(params.Bucket, 'idBucket')
    t.equal(params.Key, 'peerId.json')

    return { Body: Readable.from('INVALID', 'utf-8') }
  })

  t.not((await getPeerId()).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('config - it exports reasonable defaults', t => {
  t.plan(5)

  t.equal(concurrency, 16)
  t.equal(blocksTable, 'blocks')
  t.equal(carsTable, 'cars')
  t.equal(port, 3000)
  t.equal(telemetryPort, 3001)
})

t.test('logging - an error is properly serialized', t => {
  t.plan(2)

  const errorWithCode = new Error('FAILED')
  errorWithCode.code = 'CODE'

  const error = new Error('FAILED')

  t.equal(serializeError(error), '[Error] FAILED')
  t.equal(serializeError(errorWithCode), '[CODE] FAILED')
})
