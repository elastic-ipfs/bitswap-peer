'use strict'

const { loadEsmModule } = require('./esm-loader')
const { logger, serializeError } = require('./logging')
const { Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA, BLOCK_TYPE_UNKNOWN } = require('./protocol')
const { Connection } = require('./networking')
const { Message } = require('./protocol')
const { fetchBlocksData, fetchBlocksInfo } = require('./storage')
const { telemetry } = require('./telemetry')

// TODO move to config
const HANDLING_BLOCKS_BATCH_SIZE = 64
const PROCESSING_QUEUE_CONCURRENCY = 32

let PQueue, processingQueue
process.nextTick(async () => {
  PQueue = await loadEsmModule('p-queue')
  processingQueue = new PQueue({ concurrency: PROCESSING_QUEUE_CONCURRENCY })
})

async function peerConnect(context) {
  if (context.connection) {
    return
  }

  const dialConnection = await context.service.dial(context.peer)
  const { stream } = await dialConnection.newStream(context.protocol)

  telemetry.increaseCount('bitswap-total-connections')
  telemetry.increaseCount('bitswap-active-connections')

  context.connection = new Connection(stream)
  context.connection.on('error', err => {
    logger.warn({ err: serializeError(err) }, 'Outgoing connection error')
    peerClose(context)
    // TODO throw
  })

  context.connection.on('close', () => { peerClose(context) })

  // TODO context.connection.on('connected', resolve
}

/**
 * TODO test
 */
function handle(context) {
  if (!context.blocks.length < 1) {
    return
  }

  let i = 0
  let batchSize

  context.done = 0
  context.todo = context.blocks.length
  telemetry.increaseCount('bitswap-total-entries', context.todo)
  telemetry.increaseCount('bitswap-pending-entries', context.todo)

  do {
    const blocks = context.blocks.splice(i, HANDLING_BLOCKS_BATCH_SIZE)
    batchSize = blocks.length

    processingQueue.add(async () => {
      // append content to its block
      // TODO abort on error, es. if connection error, abort queued blocks fetch & send
      await batchFetch(blocks, context)
      await batchResponse(blocks, context)
    })
    i += batchSize
  } while (batchSize > 0)

  // TODO metrics response time
}

/**
 * fetch content blocks from storage, both for `data` type > s3 and `info` type > dynamo
 * append content to its block
 */
async function batchFetch(blocks, context) {
  try {
    const dataBlocks = []
    const infoBlocks = []
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]

      if (blocks[index].cancel) {
        continue
      }

      if (block.wantType === Entry.WantType.Block) {
        block.type = BLOCK_TYPE_DATA
        dataBlocks.push({ index, block })
        continue
      }
      if (block.wantType === Entry.WantType.Have && context.protocol === BITSWAP_V_120) {
        block.type = BLOCK_TYPE_INFO
        infoBlocks.push({ index, block })
        continue
      }
      block.type = BLOCK_TYPE_UNKNOWN
      logger.warn({ block }, 'unsupported block type')
    }

    const contents = (await Promise.all([fetchBlocksData(dataBlocks), fetchBlocksInfo(infoBlocks)])).flat(1)

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i]
      const index = content.index
      const block = content[index]

      // block may has been canceled meanwhile
      if (block.cancel) {
        continue
      }
      block.content = content

      // TODO metrics
      // content.found
      //   ? telemetry.increaseCount('bitswap-block-$type-hits')
      //   : telemetry.increaseCount('bitswap-block-$type-misses')
    }
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#batchFetch')
  }
}

async function batchResponse(blocks, context) {
  try {
    if (context.done === 0) {
      await peerConnect(context)
    }

    const message = new Message()

    await Promise.all(blocks.map((async (block) => {
      // TODO metrics
      // telemetry.increaseCount('bitswap-sent-data', block.content.length)
      // telemetry.increaseCount('bitswap-sent-info', sizeofBlock(block.content))
      return message.push(block, context)
    })()))
    await message.send(context)

    telemetry.decreaseCount('bitswap-pending-entries', context.done)
    context.done += blocks.length

    if (context.done >= context.todo) {
      peerClose(context)
    }
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#batchResponse')
  }
}

async function peerClose(context) {
  telemetry.decreaseCount('bitswap-active-connections')

  try {
    await context.connection.close()
    context.connection = null
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#peerClose')
  }

  // TODO abort pending context.blocks
}

module.exports = {
  handle
}
