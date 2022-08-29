'use strict'

const { readFile, writeFile } = require('fs/promises')
const PeerId = require('peer-id')

const { peerIdJsonFile, peerIdJsonPath } = require('./config')
const { logger } = require('./logging')
const { fetchS3 } = require('./storage')

async function downloadPeerIdFile() {
  const contents = await fetchS3({
    region: process.env.AWS_REGION,
    bucket: process.env.PEER_ID_S3_BUCKET,
    key: peerIdJsonFile,
    logger
  })
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

module.exports = { getPeerId }
