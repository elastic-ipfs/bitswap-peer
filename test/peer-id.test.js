
import t from 'tap'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { createFromJSON } from '@libp2p/peer-id-factory'
import { dirname } from 'e-ipfs-core-lib'
import config from '../src/config.js'
import { getPeerId } from '../src/peer-id.js'
import { createMockAgent, mockAwsClient } from './utils/mock.js'

let rawPeer
t.before(async () => {
  rawPeer = await readFile(resolve(dirname(import.meta.url), './fixtures/peerId.json'), 'utf-8')
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
  const peerId = await getPeerId({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath })
  const peerIdFromJson = await createFromJSON(JSON.parse(rawPeer))
  t.equal(peerId.toString(), peerIdFromJson.toString())
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

  const peerId = await getPeerId({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath })
  const peerIdFromJson = await createFromJSON(JSON.parse(rawPeer))
  t.not(peerId.toString(), peerIdFromJson.toString())
})
