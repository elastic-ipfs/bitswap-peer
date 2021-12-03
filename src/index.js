'use strict'

require('make-promises-safe')

const { writeFile } = require('fs/promises')
const { join } = require('path')

const { logger } = require('./logging')
const { startService } = require('./service')
const { fetchS3Object } = require('./storage')

async function downloadPeerIdFile() {
  const contents = await fetchS3Object(process.env.PEER_ID_S3_BUCKET, process.env.PEER_ID_FILE)
  return writeFile(join(__dirname, '..', process.env.PEER_ID_FILE), contents)
}

const before = process.env.PEER_ID_S3_BUCKET ? downloadPeerIdFile() : Promise.resolve()
before.then(startService).catch(logger.error.bind(logger))
