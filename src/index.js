
import { logger, serializeError } from './logging.js'
import config from './config.js'
import { startService } from './service.js'
import { createAwsClient } from './aws-client/index.js'
import { httpServer } from './http-server.js'
import { getPeerId } from './peer-id.js'

async function boot () {
  try {
    const awsClient = await createAwsClient(config, logger)

    // get peer identity file and at the same time check s3 availablity
    const peerId = await getPeerId({
      awsClient,
      peerIdS3Region: config.peerIdS3Region,
      peerIdS3Bucket: config.peerIdS3Bucket,
      peerIdJsonFile: config.peerIdJsonFile,
      peerIdJsonPath: config.peerIdJsonPath
    })
    // query dynamo to check availability
    await awsClient.dynamoQueryBySortKey({
      table: config.linkTableV1,
      keyName: config.linkTableBlockKey,
      keyValue: 'readiness'
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
      peerAnnounceAddr: config.peerAnnounceAddr
    }))
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

process.on('uncaughtExceptionMonitor', (err, origin) => {
  logger.fatal({ err: serializeError(err), origin }, 'uncaught exception')
})

process.on('unhandledRejection', (err, promise) => {
  logger.fatal({ err: serializeError(err), promise }, 'unhandled rejection')
})

boot()
