'use strict'

require('make-promises-safe')

const { logger } = require('./logging')
const { startService } = require('./service')
const { createAwsClient } = require('./aws-client')
const { httpServer } = require('./http-server')
const { getPeerId } = require('./peer-id')
const config = require('./config')

async function boot() {
  try {
    const awsClient = await createAwsClient(config, logger)

    const peerId = await getPeerId({
      awsClient,
      peerIdS3Region: config.peerIdS3Region,
      peerIdS3Bucket: config.peerIdS3Bucket,
      peerIdJsonFile: config.peerIdJsonFile,
      peerIdJsonPath: config.peerIdJsonPath
    })

    await httpServer.startServer({
      port: config.httpPort,
      awsClient,
      readiness: {
        dynamo: { table: config.linkTableV1 },
        s3: {
          // TODO use a specific region/bucket from config
          region: config.peerIdS3Region,
          bucket: config.peerIdS3Bucket
        }
      }
    })

    process.nextTick(() => startService({
      awsClient,
      port: config.port,
      peerId,
      peerAnnounceAddr: config.peerAnnounceAddr
    }))
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

process.on('uncaughtExceptionMonitor', (err, origin) => {
  logger.fatal({ err, origin }, 'uncaught exception')
})

boot()
