'use strict'

const { readFile } = require('fs/promises')
const { resolve } = require('path')
const { createFromJSON } = require('peer-id')
const t = require('tap')

const config = require('../src/config')
const { getPeerId } = require('../src/peer-id')
const { createMockAgent, mockAwsClient } = require('./utils/mock')

let rawPeer
t.before(async () => {
  rawPeer = await readFile(resolve(__dirname, './fixtures/peerId.json'), 'utf-8')
})

t.test('getPeerId - download the peerId from S3', async t => {
  const { awsClient } = await mockAwsClient(config)
  awsClient.agent = createMockAgent()
  const { peerIdS3Region, peerIdJsonFile, peerIdJsonPath } = config
  const peerIdS3Bucket = 'idbucket'

  awsClient.agent
    .get(`https://${peerIdS3Bucket}.s3.${peerIdS3Region}.amazonaws.com`)
    .intercept({ method: 'GET', path: `/${peerIdJsonFile}` })
    .reply(200, rawPeer)
  t.equal((await getPeerId({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath })).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})

t.test('getPeerId - creates a new PeerId if download fails', async t => {
  const { awsClient } = await mockAwsClient(config)
  awsClient.agent = createMockAgent()

  const { peerIdS3Region, peerIdJsonFile, peerIdJsonPath } = config
  const peerIdS3Bucket = 'idbucket'

  awsClient.agent
    .get(`https://${peerIdS3Bucket}.s3.${peerIdS3Region}.amazonaws.com`)
    .intercept({ method: 'GET', path: `/${peerIdJsonFile}` })
    .reply(200, 'INVALID')

  t.not((await getPeerId({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath })).toB58String(), (await createFromJSON(JSON.parse(rawPeer))).toB58String())
})
