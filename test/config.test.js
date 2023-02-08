
import t from 'tap'
import { default as config, makeConfig } from '../src/config.js'

t.test('config - defaults', async t => {
  t.same(config, {
    maxBlockDataSize: 2097152,
    maxMessageSize: 4194304,
    blocksBatchSize: 512,
    blocksTable: 'blocks',
    cacheBlockInfo: false,
    cacheBlockInfoSize: 1000,
    cacheBlockData: false,
    cacheBlockDataSize: 1000,
    dynamoRegion: 'region-test',
    dynamoConfigTable: 'config',
    carsTable: 'cars',
    blocksTableV1: 'v1-blocks',
    carsTableV1: 'v1-cars',
    linkTableV1: 'v1-blocks-cars-position',
    dynamoConfigTableKey: 'key',
    dynamoConfigTableTaggedPeersKey: 'tagged-peers',
    blocksTablePrimaryKey: 'multihash',
    carsTablePrimaryKey: 'path',
    linkTableBlockKey: 'blockmultihash',
    linkTableCarKey: 'carpath',
    awsClientRefreshCredentialsInterval: 300000,
    awsClientKeepAliveTimeout: 60000,
    awsClientConnectTimeout: 120000,
    awsClientConcurrency: 128,
    awsClientPipelining: 8,
    awsRoleSessionName: 'bitswap-peer',
    peerIdJsonFile: undefined,
    peerIdJsonPath: '/tmp/peerId.json',
    peerIdS3Bucket: undefined,
    peerIdS3Region: 'region-test',
    peerAnnounceAddr: undefined,
    port: 3000,
    httpPort: 3001,
    p2pConnectionMaxConnections: 10000,
    p2pConnectionMinConnections: 0,
    p2pConnectionPollInterval: 2000,
    p2pConnectionInboundConnectionThreshold: 5,
    p2pConnectionMaxIncomingPendingConnections: 10,
    p2pConnectionInboundUpgradeTimeout: 1000,
    p2pConnectionAutoDial: false,
    p2pConnectionAutoDialInterval: 10000,
    p2pConnectionAllow: undefined,
    p2pConnectionMplexMaxInboundStreams: 1024,
    p2pConnectionMplexMaxOutboundStreams: 10000,
    p2pConnectionMplexMaxStreamBufferSize: 4194304,
    p2pConnectionHandlerMaxInboundStreams: 1024,
    p2pConnectionHandlerMaxOutboundStreams: 1024,
    p2pConnectionTaggedPeersValue: 100,
    dynamoMaxRetries: 3,
    dynamoRetryDelay: 50,
    s3MaxRetries: 3,
    s3RetryDelay: 50,
    allowReadinessTweak: false,
    logRequests: false
  })
})

t.test('config - all by env vars', async t => {
  process.env.MAX_BLOCK_DATA_SIZE = '987'
  process.env.MAX_MESSAGE_SIZE = '369'
  process.env.BLOCKS_BATCH_SIZE = '159'
  process.env.CACHE_BLOCK_DATA = 'false'
  process.env.CACHE_BLOCK_INFO = 'false'
  process.env.CACHE_BLOCK_INFO_SIZE = '6587'
  process.env.CACHE_BLOCK_DATA_SIZE = '852'
  process.env.DYNAMO_REGION = 'dynamo-region'
  process.env.DYNAMO_BLOCKS_TABLE = 'dev-ep-blocks'
  process.env.DYNAMO_CARS_TABLE = 'dev-ep-cars'
  process.env.DYNAMO_BLOCKS_TABLE_V1 = 'dev-ep-v1-blocks'
  process.env.DYNAMO_CARS_TABLE_V1 = 'dev-ep-v1-cars'
  process.env.DYNAMO_LINK_TABLE_V1 = 'dev-ep-v1-blocks-cars-position'
  process.env.AWS_CLIENT_REFRESH_CREDENTIALS_INTERVAL = '7777'
  process.env.AWS_CLIENT_KEEP_ALIVE_TIMEOUT = '8888'
  process.env.AWS_CLIENT_CONNECT_TIMEOUT = '9999'
  process.env.AWS_CLIENT_CONCURRENCY = '128'
  process.env.AWS_CLIENT_PIPELINING = '8'
  process.env.AWS_ROLE_SESSION_NAME = 'test-peer'
  process.env.AWS_DEFAULT_REGION = 'us-west-2'
  process.env.AWS_REGION = 'us-west-2'
  process.env.AWS_ROLE_ARN = 'arn:aws:iam::123:role/dev_ep-peer_subsystem_role'
  process.env.AWS_WEB_IDENTITY_TOKEN_FILE = '/var/run/secrets/eks.amazonaws.com/serviceaccount/token'
  process.env.PEER_ID_S3_BUCKET = 'us-west-2-dev-ep-bitswap-config'
  process.env.PEER_ID_FILE = 'peerId.json'
  process.env.PEER_ID_DIRECTORY = '/foo'
  process.env.PEER_ID_S3_REGION = 'aws-s3'
  process.env.PEER_ANNOUNCE_ADDR = '/dns4/elastic-dev.dag.house/tcp/443/wss'
  process.env.PORT = '3123'
  process.env.HTTP_PORT = '3258'
  process.env.P2P_CONNECTION_MAX_CONNECTIONS = '99999'
  process.env.P2P_CONNECTION_MIN_CONNECTIONS = '1'
  process.env.P2P_CONNECTION_POLL_INTERVAL = '1000'
  process.env.P2P_CONNECTION_INBOUND_CONNECTION_THRESHOLD = '132'
  process.env.P2P_CONNECTION_MAX_INCOMING_PENDING_CONNECTIONS = '456'
  process.env.P2P_CONNECTION_INBOUND_UPGRADE_TIMEOUT = '147'
  process.env.P2P_CONNECTION_AUTO_DIAL = '4224'
  process.env.P2P_CONNECTION_AUTO_DIAL_INTERVAL = '433'
  process.env.P2P_CONNECTION_ALLOW = '/ip4/43.123.5.23/tcp/3984,/ip4/234.243.64.2,/ip4/52.55'
  process.env.P2P_CONNECTION_MPLEX_MAX_INBOUND_STREAMS = '3322'
  process.env.P2P_CONNECTION_MPLEX_MAX_OUTBOUND_STREAMS = '4477'
  process.env.P2P_CONNECTION_MPLEX_MAX_STREAM_BUFFER_SIZE = '852741'
  process.env.P2P_CONNECTION_HANDLER_MAX_INBOUND_STREAMS = '456987'
  process.env.P2P_CONNECTION_HANDLER_MAX_OUTBOUND_STREAMS = '987321'
  process.env.P2P_CONNECTION_TAGGED_PEERS_VALUE = '51'
  process.env.DYNAMO_MAX_RETRIES = '6'
  process.env.DYNAMO_RETRY_DELAY = '500'
  process.env.S3_MAX_RETRIES = '7'
  process.env.S3_RETRY_DELAY = '600'
  process.env.ALLOW_READINESS_TWEAK = 'true'
  process.env.LOG_REQUESTS = 'true'

  t.same(makeConfig(), {
    maxBlockDataSize: 987,
    maxMessageSize: 369,
    blocksBatchSize: 159,
    cacheBlockInfo: false,
    cacheBlockInfoSize: 6587,
    cacheBlockData: false,
    cacheBlockDataSize: 852,
    dynamoRegion: 'dynamo-region',
    dynamoConfigTable: 'config',
    blocksTable: 'dev-ep-blocks',
    carsTable: 'dev-ep-cars',
    blocksTableV1: 'dev-ep-v1-blocks',
    carsTableV1: 'dev-ep-v1-cars',
    linkTableV1: 'dev-ep-v1-blocks-cars-position',
    dynamoConfigTableKey: 'key',
    dynamoConfigTableTaggedPeersKey: 'tagged-peers',
    blocksTablePrimaryKey: 'multihash',
    carsTablePrimaryKey: 'path',
    linkTableBlockKey: 'blockmultihash',
    linkTableCarKey: 'carpath',
    awsClientRefreshCredentialsInterval: '7777',
    awsClientKeepAliveTimeout: 8888,
    awsClientConnectTimeout: 9999,
    awsClientConcurrency: 128,
    awsClientPipelining: 8,
    awsRoleSessionName: 'test-peer',
    peerIdJsonFile: 'peerId.json',
    peerIdJsonPath: '/foo/peerId.json',
    peerIdS3Bucket: 'us-west-2-dev-ep-bitswap-config',
    peerIdS3Region: 'aws-s3',
    peerAnnounceAddr: '/dns4/elastic-dev.dag.house/tcp/443/wss',
    port: 3123,
    httpPort: 3123,
    p2pConnectionMaxConnections: 99999,
    p2pConnectionMinConnections: 1,
    p2pConnectionPollInterval: 1000,
    p2pConnectionInboundConnectionThreshold: 132,
    p2pConnectionMaxIncomingPendingConnections: 456,
    p2pConnectionInboundUpgradeTimeout: 147,
    p2pConnectionAutoDial: false,
    p2pConnectionAutoDialInterval: 433,
    p2pConnectionAllow: ['/ip4/43.123.5.23/tcp/3984', '/ip4/234.243.64.2', '/ip4/52.55'],
    p2pConnectionMplexMaxInboundStreams: 3322,
    p2pConnectionMplexMaxOutboundStreams: 4477,
    p2pConnectionMplexMaxStreamBufferSize: 852741,
    p2pConnectionHandlerMaxInboundStreams: 456987,
    p2pConnectionHandlerMaxOutboundStreams: 987321,
    p2pConnectionTaggedPeersValue: 51,
    dynamoMaxRetries: 6,
    dynamoRetryDelay: 500,
    s3MaxRetries: 7,
    s3RetryDelay: 600,
    allowReadinessTweak: true,
    logRequests: true
  })
})
