'use strict'

const PeerId = require('peer-id')
const { readFile, writeFile } = require('fs/promises')
const { peerIdJsonFile, peerIdJsonPath } = require('./config')
const { logger } = require('./logging')

async function downloadPeerIdFile() {
  const file = peerIdJsonFile ?? 'peerId.json'
  logger.info(`Downloading PeerId from s3://${process.env.PEER_ID_S3_BUCKET}/${file}`)

  const contents = await require('./storage').fetchBlockFromS3(process.env.PEER_ID_S3_BUCKET, file)
  return writeFile(peerIdJsonPath, contents)
}

async function getPeerId() {
  if (process.env.PEER_ID_S3_BUCKET) {
    await downloadPeerIdFile()
  }

  try {
    const peerIdJson = JSON.parse(await readFile(peerIdJsonPath, 'utf-8'))
    return await PeerId.createFromJSON(peerIdJson)
  } catch (e) {
    return PeerId.create()
  }
}

module.exports = getPeerId
