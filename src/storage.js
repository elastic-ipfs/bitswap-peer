'use strict'

const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler')
const { marshall: serializeDynamoItem, unmarshall: deserializeDynamoItem } = require('@aws-sdk/util-dynamodb')
const { BufferList } = require('bl')
const { Agent } = require('https')
const { base58btc: base58 } = require('multiformats/bases/base58')
const { logger, serializeError } = require('./logging')
const telemetry = require('./telemetry')

const agent = new Agent({ keepAlive: true, keepAliveMsecs: 60000 })

const dynamoClient = new DynamoDBClient({
  requestHandler: new NodeHttpHandler({ httpsAgent: agent })
})

const s3Client = new S3Client({
  requestHandler: new NodeHttpHandler({ httpsAgent: agent })
})

function cidToKey(cid) {
  return base58.encode(cid.multihash.bytes)
}

async function readDynamoItem(table, keyName, keyValue) {
  try {
    telemetry.increaseCount('dynamo-reads')

    const record = await telemetry.trackDuration(
      'dynamo-reads',
      dynamoClient.send(new GetItemCommand({ TableName: table, Key: serializeDynamoItem({ [keyName]: keyValue }) }))
    )

    if (!record.Item) {
      return null
    }

    return deserializeDynamoItem(record.Item)
  } catch (e) {
    logger.error(`Cannot get item from DynamoDB table ${table}: ${serializeError(e)}`)
    throw e
  }
}

async function fetchS3Object(bucket, key, offset, length) {
  try {
    telemetry.increaseCount('s3-fetchs')

    let range

    // Set the range
    if (offset > 0 && length > 0) {
      range = `bytes=${offset}-${offset + length - 1}`
    } else if (length === 0) {
      return Buffer.alloc(0)
    }

    // Download from S3
    const record = await telemetry.trackDuration(
      's3-fetchs',
      s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }))
    )

    const buffer = new BufferList()

    for await (const chunk of record.Body) {
      buffer.append(chunk)
    }

    return buffer.slice()
  } catch (e) {
    logger.error(`Cannot download ${key} from S3 bucket ${bucket}: ${serializeError(e)}`)
    throw e
  }
}

module.exports = {
  cidToKey,
  readDynamoItem,
  fetchS3Object
}
