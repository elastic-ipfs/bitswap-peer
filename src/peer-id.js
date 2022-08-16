'use strict'

const { readFile, writeFile } = require('fs/promises')

const { peerIdJsonFile, peerIdJsonPath } = require('./config')
const { loadEsmModule } = require('./esm-loader')
const { logger } = require('./logging')
const { defaultDispatcher, fetchBlockFromS3 } = require('./storage')

async function downloadPeerIdFile(dispatcher) {
  logger.debug(`Downloading PeerId from s3://${process.env.PEER_ID_S3_BUCKET}/${peerIdJsonFile}`)

  const contents = await fetchBlockFromS3(
    dispatcher,
    process.env.AWS_REGION,
    process.env.PEER_ID_S3_BUCKET,
    peerIdJsonFile
  )
  return writeFile(peerIdJsonPath, contents)
}

async function getPeerId(dispatcher = defaultDispatcher) {
  const { createFromJSON, createEd25519PeerId } = await loadEsmModule('@libp2p/peer-id-factory')

  if (process.env.PEER_ID_S3_BUCKET) {
    await downloadPeerIdFile(dispatcher)
  }

  try {
    const peerIdJson = JSON.parse(await readFile(peerIdJsonPath, 'utf-8'))
    return await createFromJSON(peerIdJson)
  } catch (e) {
    return createEd25519PeerId()
  }
}

module.exports = { getPeerId }
