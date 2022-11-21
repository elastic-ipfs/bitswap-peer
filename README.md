# Bitswap peer

## Deployment environment variables

_Variables in bold are required._

| Name                  | Default       | Description                                                              |
| --------------------- | ------------- | ------------------------------------------------------------------------ |
| MAX_BLOCK_DATA_SIZE | `2 MB` | Maximum size for data block |
| MAX_MESSAGE_SIZE | `4 MB` | Maximum size response message, must be larger than a single block info/data |
| HANDLING_BLOCKS_BATCH_SIZE | `256` | Batch size of handling blocks - how many requested blocks are being processed in a batch |
| CACHE_BLOCK_INFO     | `false`       | Set to `true` to cache block informations with in a in-memory LRU cache. |
| CACHE_BLOCK_INFO_SIZE | `1000`       | Max entries of the block info cache.                                     |
| CACHE_BLOCK_DATA      | `false`       | Set to `true` to cache block data with in a in-memory LRU cache.         |
| CACHE_BLOCK_DATA_SIZE | `1000`        | Max entries of the block data cache.                                     |
| AWS_CLIENT_REFRESH_CREDENTIALS_INTERVAL | `50 * 60e3` | Credential rotation, in minutes. |
| AWS_CLIENT_CONNECT_TIMEOUT | `120000` | The timeout after the HTTP client wait for establish the connection, for AWS client. |
| AWS_CLIENT_KEEP_ALIVE_TIMEOUT | `60000` | The timeout after which a the HTTP socket without active requests will time out, for AWS client. |
| AWS_CLIENT_CONCURRENCY | `128` | The maximum concurrent connections to AWS |
| AWS_CLIENT_PIPELINING | `8` | The maximum request to pipeline in a single HTTP connections to AWS. |
| AWS_ROLE_SESSION_NAME | `bitswap-peer` | Role session name in HTTP connections to AWS. |
| DYNAMO_REGION | `$AWS_REGION` | The Dynamo region. |
| DYNAMO_BLOCKS_TABLE   | `blocks`      | The DynamoDB table where store CIDs informations to.                     |
| DYNAMO_CARS_TABLE     | `cars`        | The DynamoDB table where store CAR files informations to.                |
| DYNAMO_BLOCKS_TABLE_V1| `v1-blocks`   | The DynamoDB table where store CIDs informations to.                     |
| DYNAMO_CARS_TABLE_V1  | `v1-cars`     | The DynamoDB table where store CAR files informations to.                |
| DYNAMO_LINK_TABLE_V1  | `v1-blocks-cars-position` | The DynamoDB table with CARs-blocks links.                   |
| DYNAMO_MAX_RETRIES    | 3             | DynamoDB max attempts in case of query failure.                          |
| DYNAMO_RETRY_DELAY    | 500           | DynamoDB delay between attempts in case of failure, in milliseconds.     |
| S3_MAX_RETRIES        | 3             | S3 max attempts in case of failure.                                      |
| S3_RETRY_DELAY        | 500           | S3 delay between attempts in case of failure, in milliseconds.           |
| ENV_FILE_PATH         | `$PWD/.env`   | The environment file to load.                                            |
| PEER_ID_DIRECTORY     | `/tmp`        | The directory of the file containing the BitSwap PeerID in JSON format.  |
| PEER_ID_FILE          | `peerId.json` | The filename of the file containing the BitSwap PeerID in JSON format.   |
| PEER_ID_S3_REGION     | `$AWS_REGION` | The S3 region to download the BitSwap PeerID. |
| PEER_ID_S3_BUCKET     |               | The S3 bucket to download the BitSwap PeerID. |
| PEER_ANNOUNCE_ADDR    |               | Swarm multiaddr to announce to the network (excluding peer ID).          |
| ENABLE_KEEP_ALIVE   | `true`          | Enable Keep-alive for peers                       |
| PING_PERIOD_SECONDS   | `10`          | Wait interval for ping connected peer (Keep Alive)                       |
| PORT                  | `3000`        | The port number to listen on.                                            |
| TELEMETRY_PORT        | `3001`        | The telemetry port number for the OpenTelemetry server to listen on.     |
| ALLOW_READINESS_TWEAK | `false`       | Allow to tewak readiness state - for dev and testing only. |
| ALLOW_INSPECTION      | `false`       | Allow inspection functionalities - for dev and testing only. |
| NODE_DEBUG            |               | If it contains `aws-ipfs`, debug mode is enabled.                        |
| LOG_LEVEL            | `info` | Logging level. |
| LOG_PRETTY            | `false` | Enable pretty logging. |

Also check [AWS specifics configuration](https://github.com/elastic-ipfs/elastic-ipfs/blob/main/aws.md).

**Note**: `DYNAMO_BLOCKS_TABLE` and `DYNAMO_CARS_TABLE` will be removed after the transition to the new database schema will be completed.

### Readiness

TODO how it works, how to test

## Issues

Please report issues in the [elastic-ipfs/elastic-ipfs repo](https://github.com/elastic-ipfs/elastic-ipfs/issues).
