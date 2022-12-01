
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: process.env.ENV_FILE_PATH || path.resolve(process.cwd(), '.env') })

export function makeConfig () {
  return {
    maxBlockDataSize: process.env.MAX_BLOCK_DATA_SIZE ? parseInt(process.env.MAX_BLOCK_DATA_SIZE) : 2 * 1024 * 1024, // 2 MB
    maxMessageSize: process.env.MAX_MESSAGE_SIZE ? parseInt(process.env.MAX_MESSAGE_SIZE) : 4 * 1024 * 1024, // 4 MB
    blocksBatchSize: process.env.BLOCKS_BATCH_SIZE ? parseInt(process.env.BLOCKS_BATCH_SIZE) : 256,

    cacheBlockInfo: process.env.CACHE_BLOCK_INFO === 'true',
    cacheBlockInfoSize: process.env.CACHE_BLOCK_INFO_SIZE ? parseInt(process.env.CACHE_BLOCK_INFO_SIZE) : 1e3,

    cacheBlockData: process.env.CACHE_BLOCK_DATA === 'true',
    cacheBlockDataSize: process.env.CACHE_BLOCK_DATA_SIZE ? parseInt(process.env.CACHE_BLOCK_DATA_SIZE) : 1e3,

    dynamoRegion: process.env.DYNAMO_REGION ?? process.env.AWS_REGION,
    dynamoConfigTable: process.env.DYNAMO_CONFIG_TABLE ?? 'config',
    blocksTable: process.env.DYNAMO_BLOCKS_TABLE ?? 'blocks',
    carsTable: process.env.DYNAMO_CARS_TABLE ?? 'cars',
    blocksTableV1: process.env.DYNAMO_BLOCKS_TABLE_V1 ?? 'v1-blocks',
    carsTableV1: process.env.DYNAMO_CARS_TABLE_V1 ?? 'v1-cars',
    linkTableV1: process.env.DYNAMO_LINK_TABLE_V1 ?? 'v1-blocks-cars-position',

    dynamoConfigTableKey: 'key',
    dynamoConfigTableTaggedPeersKey: 'tagged-peers',

    blocksTablePrimaryKey: 'multihash',
    carsTablePrimaryKey: 'path',
    linkTableBlockKey: 'blockmultihash',
    linkTableCarKey: 'carpath',

    awsClientRefreshCredentialsInterval: process.env.AWS_CLIENT_REFRESH_CREDENTIALS_INTERVAL ?? 5 * 60e3, // 5 min
    awsClientKeepAliveTimeout: process.env.AWS_CLIENT_KEEP_ALIVE_TIMEOUT ? parseInt(process.env.AWS_CLIENT_KEEP_ALIVE_TIMEOUT) : 60e3, // 1min
    awsClientConnectTimeout: process.env.AWS_CLIENT_CONNECT_TIMEOUT ? parseInt(process.env.AWS_CLIENT_CONNECT_TIMEOUT) : 120e3, // 2min
    awsClientConcurrency: process.env.AWS_CLIENT_CONCURRENCY ? parseInt(process.env.AWS_CLIENT_CONCURRENCY) : 128,
    awsClientPipelining: process.env.AWS_CLIENT_PIPELINING ? parseInt(process.env.AWS_CLIENT_PIPELINING) : 8,
    awsRoleSessionName: process.env.AWS_ROLE_SESSION_NAME ?? 'bitswap-peer',

    peerIdJsonFile: process.env.PEER_ID_FILE,
    peerIdJsonPath: path.join(process.env.PEER_ID_DIRECTORY ?? '/tmp', process.env.PEER_ID_FILE ?? 'peerId.json'),
    peerIdS3Bucket: process.env.PEER_ID_S3_BUCKET,
    peerIdS3Region: process.env.PEER_ID_S3_REGION ?? process.env.AWS_REGION,

    peerAnnounceAddr: process.env.PEER_ANNOUNCE_ADDR,
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    httpPort: process.env.HTTP_PORT ? parseInt(process.env.PORT) : 3001,

    // p2p
    p2pConnectionMaxConnections: process.env.P2P_CONNECTION_MAX_CONNECTIONS ? parseInt(process.env.P2P_CONNECTION_MAX_CONNECTIONS) : 10e3,
    p2pConnectionMinConnections: process.env.P2P_CONNECTION_MIN_CONNECTIONS ? parseInt(process.env.P2P_CONNECTION_MIN_CONNECTIONS) : 0,
    p2pConnectionPollInterval: process.env.P2P_CONNECTION_POLL_INTERVAL ? parseInt(process.env.P2P_CONNECTION_POLL_INTERVAL) : 2000, // ms
    p2pConnectionInboundConnectionThreshold: process.env.P2P_CONNECTION_INBOUND_CONNECTION_THRESHOLD ? parseInt(process.env.P2P_CONNECTION_INBOUND_CONNECTION_THRESHOLD) : 5,
    p2pConnectionMaxIncomingPendingConnections: process.env.P2P_CONNECTION_MAX_INCOMING_PENDING_CONNECTIONS ? parseInt(process.env.P2P_CONNECTION_MAX_INCOMING_PENDING_CONNECTIONS) : 10,
    p2pConnectionInboundUpgradeTimeout: process.env.P2P_CONNECTION_INBOUND_UPGRADE_TIMEOUT ? parseInt(process.env.P2P_CONNECTION_INBOUND_UPGRADE_TIMEOUT) : 1000, // ms
    p2pConnectionAutoDial: process.env.P2P_CONNECTION_AUTO_DIAL === 'true',
    p2pConnectionAutoDialInterval: process.env.P2P_CONNECTION_AUTO_DIAL_INTERVAL ? parseInt(process.env.P2P_CONNECTION_AUTO_DIAL_INTERVAL) : 10000, // ms
    p2pConnectionAllow: process.env.P2P_CONNECTION_ALLOW ? process.env.P2P_CONNECTION_ALLOW.split(',').map(a => a.trim()) : undefined,
    // mplex
    p2pConnectionMplexMaxInboundStreams: process.env.P2P_CONNECTION_MPLEX_MAX_INBOUND_STREAMS ? parseInt(process.env.P2P_CONNECTION_MPLEX_MAX_INBOUND_STREAMS) : 1024,
    p2pConnectionMplexMaxOutboundStreams: process.env.P2P_CONNECTION_MPLEX_MAX_OUTBOUND_STREAMS ? parseInt(process.env.P2P_CONNECTION_MPLEX_MAX_OUTBOUND_STREAMS) : 10000,
    p2pConnectionMplexMaxStreamBufferSize: process.env.P2P_CONNECTION_MPLEX_MAX_STREAM_BUFFER_SIZE ? parseInt(process.env.P2P_CONNECTION_MPLEX_MAX_STREAM_BUFFER_SIZE) : 4194304,
    // handler
    p2pConnectionHandlerMaxInboundStreams: process.env.P2P_CONNECTION_HANDLER_MAX_INBOUND_STREAMS ? parseInt(process.env.P2P_CONNECTION_HANDLER_MAX_INBOUND_STREAMS) : 1024,
    p2pConnectionHandlerMaxOutboundStreams: process.env.P2P_CONNECTION_HANDLER_MAX_OUTBOUND_STREAMS ? parseInt(process.env.P2P_CONNECTION_HANDLER_MAX_OUTBOUND_STREAMS) : 1024,
    // tagged peers
    p2pConnectionTaggedPeersValue: process.env.P2P_CONNECTION_TAGGED_PEERS_VALUE ? parseInt(process.env.P2P_CONNECTION_TAGGED_PEERS_VALUE) : 100,

    dynamoMaxRetries: process.env.DYNAMO_MAX_RETRIES ? parseInt(process.env.DYNAMO_MAX_RETRIES) : 3,
    dynamoRetryDelay: process.env.DYNAMO_RETRY_DELAY ? parseInt(process.env.DYNAMO_RETRY_DELAY) : 100, // ms
    s3MaxRetries: process.env.S3_MAX_RETRIES ? parseInt(process.env.S3_MAX_RETRIES) : 3,
    s3RetryDelay: process.env.S3_RETRY_DELAY ? parseInt(process.env.S3_RETRY_DELAY) : 100, // ms

    allowReadinessTweak: process.env.ALLOW_READINESS_TWEAK === 'true',
    allowInspection: process.env.ALLOW_INSPECTION === 'true'
  }
}

const config = makeConfig()

export default config
