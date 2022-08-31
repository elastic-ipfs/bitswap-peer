'use strict'

const { loadEsmModule } = require('./esm-loader')
const { serializeError } = require('./logging')
const { Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA, BLOCK_TYPE_UNKNOWN } = require('./protocol')
const { Connection } = require('./networking')
const { Message } = require('./protocol')
const { fetchBlocksData, fetchBlocksInfo } = require('./storage')
const { telemetry } = require('./telemetry')
const { cidToKey, sizeofBlockInfo } = require('./util')

// TODO move to config
const HANDLING_BLOCKS_BATCH_SIZE = 64
const PROCESSING_QUEUE_CONCURRENCY = 32

let PQueue, processingQueue
process.nextTick(async () => {
  PQueue = await loadEsmModule('p-queue')
  processingQueue = new PQueue({ concurrency: PROCESSING_QUEUE_CONCURRENCY })
})

async function peerConnect(context, logger) {
  // TODO concurrency
  const dialConnection = await context.service.dial(context.peer)
  const { stream } = await dialConnection.newStream(context.protocol)

  telemetry.increaseCount('bitswap-total-connections')
  telemetry.increaseCount('bitswap-active-connections')

  context.connection = new Connection(stream)
  context.connection.on('error', err => {
    logger.warn({ err: serializeError(err) }, 'Outgoing connection error')
    peerClose(context, logger)
    // TODO throw connection failed
  })

  context.connection.on('close', () => { peerClose(context, logger) })

  // TODO context.connection.on('connected', resolve
}

/**
 * TODO test
 */
function handle({ context, logger, batchSize = HANDLING_BLOCKS_BATCH_SIZE }) {
  if (context.blocks.length < 1) {
    return
  }

  let i = 0
  let blocksLength

  context.done = 0
  context.todo = context.blocks.length
  telemetry.increaseCount('bitswap-total-entries', context.todo)
  telemetry.increaseCount('bitswap-pending-entries', context.todo)

  do {
    const blocks = context.blocks.splice(i, batchSize)
    blocksLength = blocks.length

    processingQueue.add(async () => {
      // append content to its block
      // TODO abort on error, es. if connection error, abort queued blocks fetch & send
      await batchFetch(blocks, context, logger)
      await batchResponse(blocks, context, logger)
    })
    i += blocksLength
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
      // TODO add? telemetry.increaseCount('bitswap-block-error')
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

async function batchResponse(blocks, context, logger) {
  try {
    if (context.done === 0 || !context.connection) {
      await peerConnect(context, logger)
    }

    const message = new Message()

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      if (message.push(block, context)) {
        if (block.type === BLOCK_TYPE_INFO) {
          block.info?.found && telemetry.increaseCount('bitswap-sent-info', sizeofBlockInfo(block.info))
        } else {
          block.data?.found && telemetry.increaseCount('bitswap-sent-data', block.data.content.length)
        }
      }
    }

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

module.exports = {
  handle
}
