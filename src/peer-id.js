
import { readFile, writeFile } from 'fs/promises'
import { createFromJSON, createEd25519PeerId } from '@libp2p/peer-id-factory'
import { peerIdFromBytes } from '@libp2p/peer-id'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { logger } from './logging.js'

async function downloadPeerIdFile ({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath }) {
  const contents = await awsClient.s3Fetch({
    region: peerIdS3Region,
    bucket: peerIdS3Bucket,
    key: peerIdJsonFile
  })
  return writeFile(peerIdJsonPath, contents)
}

function createPeerIdFromMultihash (multihash) {
  return peerIdFromBytes(uint8ArrayFromString(multihash, 'base58btc'))
}

async function getPeerId ({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath }) {
  if (!peerIdJsonPath) {
    return createEd25519PeerId()
  }
  if (peerIdS3Bucket) {
    await downloadPeerIdFile({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath })
  }

  try {
    const peerIdJson = JSON.parse(await readFile(peerIdJsonPath, 'utf-8'))
    const { id, privKey, pubKey } = peerIdJson

    const peer = await createFromJSON({ id, privKey, pubKey })
    logger.info('peerId loaded from JSON ' + peerIdJsonPath)
    return peer
  } catch (err) {
    logger.fatal({ err }, 'cant load peer file from ' + peerIdJsonPath)
    throw new Error('cant load peer file from ' + peerIdJsonPath)
  }
}

export { getPeerId, createPeerIdFromMultihash }
