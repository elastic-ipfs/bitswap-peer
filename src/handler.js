'use strict'

const { loadEsmModule } = require('./esm-loader')
const config = require('./config')
const { serializeError } = require('./logging')
const { Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA, BLOCK_TYPE_UNKNOWN } = require('./protocol')
const { Connection } = require('./networking')
const { Message } = require('./protocol')
const { fetchBlocksData, fetchBlocksInfo } = require('./storage')
const { telemetry } = require('./telemetry')
const { cidToKey, sizeofBlockInfo } = require('./util')

let PQueue, processingQueue
process.nextTick(async () => {
  PQueue = await loadEsmModule('p-queue')
  processingQueue = new PQueue({ concurrency: config.processingQueueConcurrency })
})

/**
 * dedupe concurrent connections, peerConnect could be called multiple times while connecting
 */
function connect(context, stream, logger) {
  if (context.connecting) { return context.connecting }
  context.connecting = new Promise((resolve, reject) => {
    context.connection = new Connection(stream)
    context.connection.on('error', err => {
      logger.warn({ err: serializeError(err) }, 'Outgoing connection error')
      peerClose(context, logger)
      reject(err)
    })

    context.connection.on('close', () => { peerClose(context, logger) })

    // TODO context.connection.on('connected', resolve
    resolve()
  })
  return context.connecting
}

async function peerClose(context, logger) {
  telemetry.decreaseCount('bitswap-active-connections')

  try {
    context.connection && (await context.connection.close())
    context.connection = null
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#peerClose')
  }

  // TODO abort pending context.blocks
}

async function peerConnect(context, logger) {
  const dialConnection = await context.service.dial(context.peer)
  const { stream } = await dialConnection.newStream(context.protocol)

  telemetry.increaseCount('bitswap-total-connections')
  telemetry.increaseCount('bitswap-active-connections')

  await connect(context, stream, logger)
}

/**
 * TODO test
 */
function handle({ context, logger, batchSize = config.blocksBatchSize }) {
  if (context.blocks.length < 1) {
    return
  }

  let blocksLength

  context.done = 0
  context.todo = context.blocks.length
  telemetry.increaseCount('bitswap-total-entries', context.todo)
  telemetry.increaseCount('bitswap-pending-entries', context.todo)

  do {
    const blocks = context.blocks.splice(0, batchSize)
    blocksLength = blocks.length

    processingQueue.add(async () => {
      // append content to its block
      // TODO abort on error, es. if connection error, abort queued blocks fetch & send
      await batchFetch(blocks, context, logger)
      await batchResponse(blocks, context, logger)
    })
  } while (blocksLength === batchSize)

  // TODO metrics response time
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

      if (block.wantType === Entry.WantType.Block) {
        block.type = BLOCK_TYPE_DATA
        block.key = cidToKey(block.cid)
        dataBlocks.push(block)
        continue
      }
      if (block.wantType === Entry.WantType.Have && context.protocol === BITSWAP_V_120) {
        block.type = BLOCK_TYPE_INFO
        block.key = cidToKey(block.cid)
        infoBlocks.push(block)
        continue
      }

      block.type = BLOCK_TYPE_UNKNOWN
      logger.warn({ block }, 'unsupported block type')
    }

    await Promise.all([
      fetchBlocksInfo({ blocks: infoBlocks, logger }),
      fetchBlocksData({ blocks: dataBlocks, logger })
    ])
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#batchFetch')
  }
}

const messageSize = {
  [BLOCK_TYPE_DATA]: (block) => block.data?.content?.length ?? 0,
  [BLOCK_TYPE_INFO]: (block) => sizeofBlockInfo(block.info)
}

const sentMetrics = {
  [BLOCK_TYPE_DATA]: (block, size) => {
    block.data?.found && telemetry.increaseCount('bitswap-sent-data', size)
  },
  [BLOCK_TYPE_INFO]: (block, size) => {
    block.info?.found && telemetry.increaseCount('bitswap-sent-info', size)
  }
}

async function batchResponse(blocks, context, logger) {
  try {
    if (context.done === 0 || !context.connection) {
      await peerConnect(context, logger)
    }

    let message = new Message()
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      const size = messageSize[block.type](block)
      // maxMessageSize MUST BE larger than a single block info/data
      if (message.size() + size > config.maxMessageSize) {
        // TODO use a sending queue instead of awaiting?
        // consider also connection open/close task - can't be parallel
        await message.send(context)
        message = new Message()
      }

      if (message.push(block, size, context)) {
        sentMetrics[block.type](block, size)
      }
    }

    // TODO same as above: use a sending queue instead of awaiting?
    await message.send(context)

    telemetry.decreaseCount('bitswap-pending-entries', context.done)
    context.done += blocks.length

    if (context.done >= context.todo) {
      // note: not awaiting
      peerClose(context, logger)
    }
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#batchResponse')
  }
}

module.exports = {
  handle
}
