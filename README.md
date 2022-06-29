# IPFS Elastic Provider Bitswap peer

## Deployment environment variables

_Variables in bold are required._

| Name                  | Default       | Description                                                              |
| --------------------- | ------------- | ------------------------------------------------------------------------ |
| AWS_ACCESS_KEY_ID     |               | The AWS key ID.                                                          |
| AWS_REGION            |               | The AWS region.                                                          |
| AWS_SECRET_ACCESS_KEY |               | The AWS access key.                                                      |
| CACHE_BLOCKS_INFO     | `false`       | Set to `true` to cache block informations with in a in-memory LRU cache. |
| CACHE_BLOCKS_SIZE     | `1e3`         | Max entries of the cache.                                                |
| CONCURRENCY           | `128`         | The maximum concurrency when searching CIDs.                             |
| DYNAMO_BLOCKS_TABLE   | `blocks`      | The DynamoDB table where store CIDs informations to.                     |
| DYNAMO_CARS_TABLE     | `cars`        | The DynamoDB table where store CAR files informations to.                |
| DYNAMO_MAX_RETRIES    | 3             | DynamoDB max attempts in case of query failure.                          |
| DYNAMO_RETRY_DELAY    | 500           | DynamoDB delay between attempts in case of failure, in milliseconds.     |
| S3_MAX_RETRIES        | 3             | S3 max attempts in case of failure.                                      |
| S3_RETRY_DELAY        | 500           | S3 delay between attempts in case of failure, in milliseconds.           |
| ENV_FILE_PATH         | `$PWD/.env`   | The environment file to load.                                            |
| NODE_DEBUG            |               | If it contains `aws-ipfs`, debug mode is enabled.                        |
| NODE_ENV              |               | Set to `production` to disable pretty logging.                           |
| PEER_ID_DIRECTORY     | `/tmp`        | The directory of the file containing the BitSwap PeerID in JSON format.  |
| PEER_ID_FILE          | `peerId.json` | The filename of the file containing the BitSwap PeerID in JSON format.   |
| PEER_ID_S3_BUCKET     |               | The S3 bucket to download the BitSwap PeerID in JSON format.             |
| PIPELINING            | `16`          | The maximum request to pipeline in a single HTTP connections in AWS.     |
| PING_PERIOD_SECONDS   | `10`          | Wait interval for ping connected peer (Keep Alive)                       |
| PORT                  | `3000`        | The port number to listen on.                                            |
| TELEMETRY_PORT        | `3001`        | The telemetry port number for the OpenTelemetry server to listen on.     |
