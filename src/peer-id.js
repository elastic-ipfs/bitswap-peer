'use strict'

const { readFile, writeFile } = require('fs/promises')
const PeerId = require('peer-id')

async function downloadPeerIdFile({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath }) {
  const contents = await awsClient.s3Fetch({
    region: peerIdS3Region,
    bucket: peerIdS3Bucket,
    key: peerIdJsonFile
  })
  return writeFile(peerIdJsonPath, contents)
}

async function getPeerId({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath }) {
  if (peerIdS3Bucket) {
    await downloadPeerIdFile({ awsClient, peerIdS3Region, peerIdS3Bucket, peerIdJsonFile, peerIdJsonPath })
  }

  try {
    const peerIdJson = JSON.parse(await readFile(peerIdJsonPath, 'utf-8'))
    return await PeerId.createFromJSON(peerIdJson)
  } catch (e) {
    return PeerId.create()
  }
}

module.exports = { getPeerId }
