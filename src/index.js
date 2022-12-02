
import { createAwsClient } from 'e-ipfs-core-lib'
import { logger } from './logging.js'
import config from './config.js'
import { startService } from './service.js'
import { httpServer } from './http-server.js'
import { getPeerId } from './peer-id.js'
import { createConnectionConfig } from './util.js'

async function boot () {
  logger.info('Application boot')
  const readinessConfig = {
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

  try {
    logger.info('Create AWS client')
    const awsClient = await createAwsClient(config, logger)

    logger.info('Load peers')
    const peerId = await getPeerId({
      awsClient,
      peerIdS3Region: config.peerIdS3Region,
      peerIdS3Bucket: config.peerIdS3Bucket,
      peerIdJsonFile: config.peerIdJsonFile,
      peerIdJsonPath: config.peerIdJsonPath
    })

    logger.info('Check readyness')
    await awsClient.dynamoQueryBySortKey({
      table: readinessConfig.dynamo.table,
      keyName: readinessConfig.dynamo.keyName,
      keyValue: readinessConfig.dynamo.keyValue
    })

    logger.info('Get tagged peers')
    const taggedPeers = await awsClient.dynamoGetItem({
      table: config.dynamoConfigTable,
      keyName: config.dynamoConfigTableKey,
      keyValue: config.dynamoConfigTableTaggedPeersKey
    })

    logger.info('Start server')
    await httpServer.startServer({
      port: config.httpPort,
      awsClient,
      readinessConfig,
      allowReadinessTweak: config.allowReadinessTweak
    })

    logger.info('Start service')
    process.nextTick(() => startService({
      awsClient,
      port: config.port,
      peerId,
      peerAnnounceAddr: config.peerAnnounceAddr,
      connectionConfig: createConnectionConfig(config),
      taggedPeers: JSON.parse(taggedPeers.value)
    }))
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

process.on('uncaughtExceptionMonitor', (err, origin) => {
  logger.fatal({ err, origin }, 'uncaught exception')
})

process.on('unhandledRejection', (err, promise) => {
  logger.fatal({ err, promise }, 'unhandled rejection')
})

boot()
