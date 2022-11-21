
import { logger, serializeError } from './logging.js'
import config from './config.js'
import { startService } from './service.js'
import { createAwsClient } from './aws-client/index.js'
import { httpServer } from './http-server.js'
import { getPeerId } from './peer-id.js'

async function boot () {
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
    const awsClient = await createAwsClient(config, logger)

    const peerId = await getPeerId({
      awsClient,
      peerIdS3Region: config.peerIdS3Region,
      peerIdS3Bucket: config.peerIdS3Bucket,
      peerIdJsonFile: config.peerIdJsonFile,
      peerIdJsonPath: config.peerIdJsonPath
    })
    await awsClient.dynamoQueryBySortKey({
      table: readinessConfig.dynamo.table,
      keyName: readinessConfig.dynamo.keyName,
      keyValue: readinessConfig.dynamo.keyValue
    })

    await httpServer.startServer({
      port: config.httpPort,
      awsClient,
      readinessConfig,
      allowReadinessTweak: config.allowReadinessTweak
    })

    process.nextTick(() => startService({
      awsClient,
      port: config.port,
      peerId,
      peerAnnounceAddr: config.peerAnnounceAddr,
      connectionConfig: {
        // libp2p
        maxConnections: config.p2pConnectionMaxConnections,
        minConnections: config.p2pConnectionMinConnections,
        pollInterval: config.p2pConnectionPollInterval,
        inboundConnectionThreshold: config.p2pConnectionInboundConnectionThreshold,
        maxIncomingPendingConnections: config.p2pConnectionMaxIncomingPendingConnections,
        inboundUpgradeTimeout: config.p2pConnectionInboundUpgradeTimeout,
        autoDial: config.p2pConnectionAutoDial,
        autoDialInterval: config.p2pConnectionAutoDialInterval,
        // mplex
        maxInboundStreams: config.p2pConnectionMaxInboundStreams,
        maxOutboundStreams: config.p2pConnectionMaxOutboundStreams,
        maxStreamBufferSize: config.p2pConnectionMaxStreamBufferSize
      }
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
