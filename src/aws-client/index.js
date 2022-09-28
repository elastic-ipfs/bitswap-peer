'use strict'

const Client = require('./Client')

function awsClientOptions(config, logger) {
  const awsAgentOptions = {
    keepAliveTimeout: config.awsClientKeepAliveTimeout,
    connections: config.awsClientConcurrency,
    pipelining: config.awsClientPipelining
  }
  const awsS3Options = { maxRetries: config.s3MaxRetries, retryDelay: config.s3RetryDelay }
  const awsDynamoOptions = { region: config.dynamoRegion, maxRetries: config.dynamoMaxRetries, retryDelay: config.dynamoRetryDelay }
  return {
    awsAgentOptions,
    refreshCredentialsInterval: config.awsClientRefreshCredentialsInterval,
    s3Options: awsS3Options,
    dynamoOptions: awsDynamoOptions,
    roleSessionName: config.awsRoleSessionName,
    logger
  }
}

async function createAwsClient(config, logger) {
  const awsClient = new Client(awsClientOptions(config, logger))
  await awsClient.init()
  return awsClient
}

module.exports = {
  createAwsClient,
  awsClientOptions,
  Client
}
