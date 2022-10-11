'use strict'

const { loadEsmModule } = require('./esm-loader')
const config = require('./config')
const { serializeError } = require('./logging')
const { Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA } = require('./protocol')
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

function createContext({ service, peer, protocol, wantlist, awsClient, connectionPool }) {
  const context = {
    state: 'ok',
    awsClient,
    connectionPool,
    service,
    peer,
    protocol,
    blocks: wantlist.entries,
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
    context.connection = await context.connectionPool.acquire(context)

    context.onConnectionError = () => { context.state = 'error' }
    context.onConnectionClose = () => endResponse(context)

    context.connection.on('error', context.onConnectionError)
    context.connection.on('close', context.onConnectionClose)
  } catch (error) {
    // TODO add metric connection-error
    logger.error({ error: serializeError(error), peer: context.peer?._idB58String || context.peer }, 'error on handler#batchResponse acquire connection')
    last && endResponse(context)
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

  last && endResponse(context)
}

// end response
// note: it does NOT disconnect the peer
function endResponse(context) {
  if (context.state === 'end') { return }

  if (context.connection) {
    context.connection.off('error', context.onConnectionError)
    context.connection.off('close', context.onConnectionClose)
  }

  context.connectionPool.removePending(context.peer)
  telemetry.decreaseCount('bitswap-pending-entries', context.todo)
  inspect.metrics.decrease('requests')
  inspect.metrics.decrease('blocks', context.todo)

  context.state = 'end'
  context.close()
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
