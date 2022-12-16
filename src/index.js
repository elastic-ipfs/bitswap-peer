
import { createAwsClient } from 'e-ipfs-core-lib'
import { logger } from './logging.js'
import config from './config.js'
import { startService } from './service.js'
import { httpServer } from './http-server.js'
import { getPeerId } from './peer-id.js'
import { createConnectionConfig } from './util.js'

async function boot () {
  const readinessConfig = {
    // TODO
  }

  try {
    const awsClient = await createAwsClient(config, logger)

    const peerId = await getPeerId({
      awsClient,
      peerIdS3Region: config.peerIdS3Region,
      peerIdS3Bucket: config.peerIdS3Bucket,
      peerIdJsonFile: config.peerIdJsonFile,
      peerIdJsonPath: config.peerIdJsonPath
    })

    const taggedPeers = await awsClient.dynamoGetItem({
      table: config.dynamoConfigTable,
      keyName: config.dynamoConfigTableKey,
      keyValue: config.dynamoConfigTableTaggedPeersKey
    })

    await httpServer.startServer({
      port: config.httpPort,
      awsClient
    })

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
