
import { readFile, writeFile } from 'fs/promises'
import { createFromJSON, createEd25519PeerId } from '@libp2p/peer-id-factory'
import { logger, serializeError } from './logging.js'

async function downloadPeerIdFile ({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath }) {
  const contents = await awsClient.s3Fetch({
    region: peerIdS3Region,
    bucket: peerIdS3Bucket,
    key: peerIdJsonFile
  })
  return writeFile(peerIdJsonPath, contents)
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
    logger.error({ err: serializeError(err) }, 'cant load peer file from ' + peerIdJsonPath)
    return createEd25519PeerId()
  }
}

export { getPeerId }
