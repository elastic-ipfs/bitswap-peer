'use strict'

const { loadEsmModule } = require('./esm-loader')
const config = require('./config')
const { serializeError } = require('./logging')
const { Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA } = require('./protocol')
const { Connection } = require('./networking')
const { Message } = require('./protocol')
const { fetchBlocksData, fetchBlocksInfo } = require('./storage')
const { telemetry } = require('./telemetry')
const inspect = require('./inspect')
const { cidToKey, sizeofBlockInfo } = require('./util')

let PQueue, processingQueue
process.nextTick(async () => {
  PQueue = await loadEsmModule('p-queue')
  processingQueue = new PQueue({ concurrency: config.processingQueueConcurrency })
})

/**
 * connection is optional, will be established at first send on handler
 */
function createContext({ service, peer, protocol, wantlist, connection, awsClient, connectionPool }) {
  const context = {
    state: 'ok',
    awsClient,
    connectionPool,
    service,
    peer,
    protocol,
    blocks: wantlist.entries,
    connection,
    done: 0,
    todo: 0,
    batches: null,
    // use `end` and `close` to sync context processing end
    close: null,
    end: null
  }
  context.end = new Promise(resolve => { context.close = resolve })
  return context
}

/**
 * @todo retry?
 */
async function peerConnect(context, logger) {
  if (context.connection) { return }

  const connection = context.connectionPool.get(context.peer)
  if (connection) {
    context.connection = connection
    return
  }

  // dedupe acquiring stream
  if (!context.stream) {
    await acquireStream(context)
  }

  await connect(context, logger)
}

/**
 * acquire peer stream, deduping by context - could be called multiple times while connecting
 * coupled with peerConnect
 */
function acquireStream(context) {
  console.log(' >>> acquireStream')
  if (context.stream) { return Promise.resolve() }
  if (context.acquiringStream) { return context.acquiringStream }

  context.acquiringStream = new Promise((resolve, reject) => {
    // TODO Connection class should handle the whole connection process
    // either is has a stream or has to acquire it
    context.service.dial(context.peer)
      .then(dialConnection => {
        return dialConnection.newStream(context.protocol)
      })
      .then(({ stream }) => {
        context.stream = stream
        console.log(' === acquireStream DONE')
        resolve()
      })
      .catch(error => reject(error))
  })

  return context.acquiringStream
}

/**
 * establish connection, deduping by context - could be called multiple times while connecting
 * coupled with peerConnect
 */
function connect(context, logger) {
  console.log(' >>> connect')
  if (context.connection) { return Promise.resolve() }
  if (context.connecting) { return context.connecting }

  context.connecting = new Promise((resolve, reject) => {
    context.connection = new Connection(context.stream)
    context.connectionPool.set(context.peer, context.connection)

    console.log(' === connect DONE')

    context.connection.on('error', err => {
      context.state = 'error'
      logger.warn({ err: serializeError(err) }, 'outgoing connection error')
      // peerClose(context, logger)
      reject(err)
    })

    // on closing connetion, due to inactivity or other external reason
    // clean up context
    context.connection.on('close', () => { peerClose(context, logger) })

    // TODO should resolve on connection ready
    // Connection class should expose a "ready" event or something
    // see service.on('peer:connect') and service.on('peer:disconnect') on service.js
    resolve()
  })
  return context.connecting
}

// close response
// note: it does NOT disconnect the peer
function closeResponse(context) {
  if (context.state === 'end') {
    return
  }
  context.connectionPool.removePending(context.peer)
  telemetry.decreaseCount('bitswap-pending-entries', context.todo)
  inspect.metrics.decrease('requests')
  inspect.metrics.decrease('blocks', context.todo)

  context.state = 'end'
  context.close()
}

async function peerClose(context, logger) {
  try {
    closeResponse(context)
    if (context.connection) {
      // TODO remove? connection is already closed
      // await context.connection.close()
      context.connection = null
    } else if (context.stream) {
      // could happen that stream is established but context.connection is not
      // TODO solve ^ > move the connection ops to Connection class
      context.stream.close()
      context.stream = null
    }
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#peerClose')
  }
}

function handle({ context, logger, batchSize = config.blocksBatchSize, processing = processingQueue }) {
  return new Promise(resolve => {
    if (context.blocks.length < 1) {
      resolve()
      return
    }

    context.todo = context.blocks.length
    context.connectionPool.addPending(context.peer)
    telemetry.increaseCount('bitswap-total-entries', context.todo)
    telemetry.increaseCount('bitswap-pending-entries', context.todo)
    inspect.metrics.increase('blocks', context.todo)
    inspect.metrics.increase('requests')

    let blocksLength
    let batches = Math.ceil(context.todo / batchSize)
    do {
      const blocks = context.blocks.splice(0, batchSize)

      if (blocks.length === 0) {
        break
      }

      blocksLength = blocks.length
      processing.add(async () => {
        // state can be 'error' or 'end'
        // in those cases skip fetching and response, iterate pending batches and close
        if (context.state === 'ok') {
          // append content to its block
          const fetched = await batchFetch(blocks, context, logger)
          // close connection on last batch
          batches--
          await batchResponse({ blocks: fetched, context, logger, last: batches === 0 })
        }
      })
    } while (blocksLength === batchSize)

    // TODO metrics response time / entries by type (info or data)
    // use: context.done

    processing.add(async () => {
      await context.end
      resolve()
    })
  })
}

/**
 * fetch blocks content from storage
 * append content to its block
 */
async function batchFetch(blocks, context, logger) {
  try {
    const dataBlocks = []
    const infoBlocks = []
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const key = cidToKey(block.cid)
      if (!key) {
        logger.error({ block }, 'invalid block cid')
        telemetry.increaseCount('bitswap-block-error')
        continue
      }
      block.key = key

      if (block.wantType === Entry.WantType.Block) {
        block.type = BLOCK_TYPE_DATA
        dataBlocks.push(block)
        continue
      }
      if (block.wantType === Entry.WantType.Have && context.protocol === BITSWAP_V_120) {
        block.type = BLOCK_TYPE_INFO
        infoBlocks.push(block)
        continue
      }

      // other blocks are stripped and not fetched - and not responded
      logger.error({ block }, 'unsupported block type')
      telemetry.increaseCount('bitswap-block-error')
    }

    await Promise.all([
      fetchBlocksInfo({ blocks: infoBlocks, logger, awsClient: context.awsClient }),
      fetchBlocksData({ blocks: dataBlocks, logger, awsClient: context.awsClient })
    ])
    return [...infoBlocks, ...dataBlocks]
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#batchFetch')
  }
}

async function batchResponse({ blocks, context, logger, last }) {
  if (!blocks) { return }

  try {
    if (!context.connection) {
      await peerConnect(context, logger)
    }
  } catch (error) {
    // TODO add metric connection-error
    logger.error({ error: serializeError(error), peer: context.peer?._idB58String || context.peer }, 'error on handler#batchResponse peerConnect')
    last && closeResponse(context)
    return
  }

  try {
    let message = new Message()
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      const size = messageSize[block.type](block)
      // maxMessageSize MUST BE larger than a single block info/data
      if (message.size() + size > config.maxMessageSize) {
        await message.send(context)
        message = new Message()
      }

      message.push(block, size, context.protocol)
      sentMetrics[block.type](block, size)
    }

    await message.send(context)
    context.done += blocks.length
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#batchResponse')
  }

  last && closeResponse(context)
}

const messageSize = {
  [BLOCK_TYPE_DATA]: (block) => block.data?.content?.length ?? 0,
  [BLOCK_TYPE_INFO]: (block) => sizeofBlockInfo(block.info)
}

// not accurate, not considering fixed overhead
const sentMetrics = {
  [BLOCK_TYPE_DATA]: (block, size) => {
    block.data?.found && telemetry.increaseCount('bitswap-sent-data', size)
  },
  [BLOCK_TYPE_INFO]: (block, size) => {
    block.info?.found && telemetry.increaseCount('bitswap-sent-info', size)
  }
}

module.exports = {
  handle, createContext
}
