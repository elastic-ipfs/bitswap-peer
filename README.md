# Bitswap peer

## Deployment environment variables

_Variables in bold are required._

| Name                  | Default       | Description                                                              |
| --------------------- | ------------- | ------------------------------------------------------------------------ |
| MAX_BLOCK_DATA_SIZE | `2 MB` | Maximum size for data block |
| MAX_MESSAGE_SIZE | `4 MB` | Maximum size response message, must be larger than a single block info/data |
| BLOCKS_BATCH_SIZE | `512` | Batch size of handling blocks - how many requested blocks are being processed in a batch |
| CACHE_BLOCK_INFO     | `false`       | Set to `true` to cache block informations with in a in-memory LRU cache. |
| CACHE_BLOCK_INFO_SIZE | `1000`       | Max entries of the block info cache.                                     |
| CACHE_BLOCK_DATA      | `false`       | Set to `true` to cache block data with in a in-memory LRU cache.         |
| CACHE_BLOCK_DATA_SIZE | `1000`        | Max entries of the block data cache.                                     |
| AWS_CLIENT_REFRESH_CREDENTIALS_INTERVAL | `5 * 60e3` | Credential rotation, in ms. |
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
| DYNAMO_CONFIG_TABLE  | `config` | The DynamoDB table with configurations, see [tagged peers](#tagged-peers). |
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
| PORT                  | `3000`        | The port number to listen on.                                            |
| P2P_CONNECTION_MAX_CONNECTIONS | `10000` | p2p max connections, forwared to `libp2p` `connectionManager.maxConnections` |
| P2P_CONNECTION_MIN_CONNECTIONS | `0` | p2p min connections, forwared to `libp2p` `connectionManager.minConnections` |
| P2P_CONNECTION_POLL_INTERVAL | `2000` | ms, p2p poll interval, forwared to `libp2p` `connectionManager.pollInterval` |
| P2P_CONNECTION_INBOUND_CONNECTION_THRESHOLD | `5` | p2p inbound connection threshold, forwared to `libp2p` `connectionManager.inboundConnectionThreshold` |
| P2P_CONNECTION_MAX_INCOMING_PENDING_CONNECTIONS | `10` | p2p max incoming pending connections, forwared to `libp2p` `connectionManager.maxIncomingPendingConnections` |
| P2P_CONNECTION_INBOUND_UPGRADE_TIMEOUT | `1000` | ms, p2p inbound upgrade timeout, forwared to `libp2p` `connectionManager.inboundUpgradeTimeout` |
| P2P_CONNECTION_AUTO_DIAL | `false` | p2p auto dial to discovered peers, forwared to `libp2p` `connectionManager.autoDial` |
| P2P_CONNECTION_AUTO_DIAL_INTERVAL | `10000` | ms, p2p poll interval, forwared to `libp2p` `connectionManager.autoDialInterval` |
| P2P_CONNECTION_ALLOW | | comma separated list of allow peer to bypass the connection limits, forwared to `libp2p` `connectionManager.allow` |
| P2P_CONNECTION_MAX_INBOUND_STREAMS | `1024` | p2p mplex incoming streams allowed per connection |
| P2P_CONNECTION_MAX_OUTBOUND_STREAMS | `10000` | p2p mplex outgoing streams allowed per connection |
| P2P_CONNECTION_MAX_STREAM_BUFFER_SIZE | `4194304` | p2p mplex message buffer size, in bytes, default `4MB` |
| P2P_CONNECTION_HANDLER_MAX_INBOUND_STREAMS | `1024` | p2p handler max incoming streams limit at the same time on each connection |
| P2P_CONNECTION_HANDLER_MAX_OUTBOUND_STREAMS | `1024` | p2p handler max outgoing streams limit at the same time on each connection |
| P2P_CONNECTION_TAGGED_PEERS_VALUE | `100` | p2p tagged peers default value, see [tagged peers](#tagged-peers). |
| TELEMETRY_PORT        | `3001`        | The telemetry port number for the OpenTelemetry server to listen on.     |
| ALLOW_READINESS_TWEAK | `false`       | Allow to tewak readiness state - for dev and testing only. |
| ALLOW_INSPECTION      | `false`       | Allow inspection functionalities - for dev and testing only. |
| NODE_DEBUG            |               | If it contains `aws-ipfs`, debug mode is enabled.                        |
| LOG_LEVEL            | `info` | Logging level. |
| LOG_PRETTY            | `false` | Enable pretty logging. |

Also check [AWS specifics configuration](https://github.com/elastic-ipfs/elastic-ipfs/blob/main/aws.md).

**Note**: `DYNAMO_BLOCKS_TABLE` and `DYNAMO_CARS_TABLE` will be removed after the transition to the new database schema will be completed.

## p2p Connections

References

- https://github.com/libp2p/js-libp2p/blob/master/doc/CONNECTION_MANAGER.md
- https://github.com/libp2p/js-libp2p/blob/master/doc/LIMITS.md
- https://github.com/libp2p/js-libp2p-mplex#api

- ConnectionManagerInit https://github.com/libp2p/js-libp2p/blob/master/src/connection-manager/index.ts#L41
- DefaultOptions https://github.com/libp2p/js-libp2p/blob/master/src/connection-manager/index.ts#L25

## Tagged Peers

**Tagged Peers** is the way for `libp2p` to set priorities on peer connections closing, see [the libp2p doc](https://github.com/libp2p/js-libp2p/blob/master/doc/LIMITS.md#closing-connections); so we identify peers to exclude them from the automatic connection closing.

The list of tagged peers is in the `DYNAMO_CONFIG_TABLE` at row `key:tagged-peers`, the JSON format is

```json
[
    {
      "name": "ipfs-bank1-sv15", // simple label
      "peer": "12D3KooWGW4U4iN6tcvFKcQD3Ay2i6LDdEAEJgZgdHUNasGGq8bb", // valid peerId multihash
      "value": 100 // optional, number between 0-100, default is P2P_CONNECTION_TAGGED_PEERS_VALUE
    }
]
```

For example

```json
[
    {
      "name": "ipfs-bank1-sv15",
      "peer": "12D3KooWGW4U4iN6tcvFKcQD3Ay2i6LDdEAEJgZgdHUNasGGq8bb",
      "value": 99
    },
    {
      "name": "ipfs-bank10-dc13",
      "peer": "12D3KooWB9veWuW6rJ5YeTSYt5NSdTtJj6KzzriWwWPLv9SNnvph"
    }
]
```

The list is accepted as `all-or-nothing`, to avoid runtime issues; so if a single entry is invalid, the service won't start.

### Readiness

The `/readiness` endpoint on the http server is used by the load balancer to determine if the service is healthy or not.
The readiness state is set by the last DynamoDB an S3 request, and it's served instantly when called.
In case of state of error, the `/readiness` will perform calls to the DynamoDB and S3 services and will return the result state.

For testing purposes only, it's possible to set the readiness state by enabling `ALLOW_READINESS_TWEAK` and calling the `/readiness/tweak` endpoint passing the readiness state, for example:

```bash
ALLOW_READINESS_TWEAK=true node src/index.js
```

so the state can be set calling

```bash
curl http://localhost:3001/readiness/tweak?dynamo=false&s3=true
```

will set the state of DynamoDB to error, and the following call to `/readiness` will return the error state

## Issues

Please report issues in the [elastic-ipfs/elastic-ipfs repo](https://github.com/elastic-ipfs/elastic-ipfs/issues).
