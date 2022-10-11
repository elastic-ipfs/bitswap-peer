'use strict'

require('make-promises-safe')

const { logger } = require('./logging')
const { startService } = require('./service')
const { createAwsClient } = require('./aws-client')
const { PeerConnectionPool } = require('./networking')
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
        dynamo: {
          table: config.linkTableV1,
          keyName: config.linkTableBlockKey,
          keyValue: 'readiness'
        },
        s3: {
          region: config.peerIdS3Region,
          bucket: config.peerIdS3Bucket,
          key: config.peerIdJsonFile
        }
      }
    })

    process.nextTick(() => startService({
      awsClient,
      port: config.port,
      peerId,
      peerAnnounceAddr: config.peerAnnounceAddr,
      // TODO config
      connectionPool: new PeerConnectionPool({ logger })
    }))
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

process.on('uncaughtExceptionMonitor', (err, origin) => {
  logger.fatal({ err, origin }, 'uncaught exception')
})

boot()
