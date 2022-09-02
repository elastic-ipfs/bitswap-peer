'use strict'

const { loadEsmModule } = require('./esm-loader')
const config = require('./config')
const { serializeError } = require('./logging')
const { Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA } = require('./protocol')
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
 * connection is optional, will be established at first send on handler
 */
function createContext({ service, peer, protocol, wantlist, connection }) {
  const context = {
    state: 'ok',
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

async function peerConnect(context, logger) {
  if (context.connection) { return }
  const dialConnection = await context.service.dial(context.peer)
  const { stream } = await dialConnection.newStream(context.protocol)

  telemetry.increaseCount('bitswap-total-connections')
  telemetry.increaseCount('bitswap-active-connections')

  await connect(context, stream, logger)
}
/**
 * establish connection, deduping - could be called multiple times while connecting
 */
function connect(context, stream, logger) {
  if (context.connecting) { return context.connecting }

  context.connecting = new Promise((resolve, reject) => {
    context.connection = new Connection(stream)
    context.connection.on('error', err => {
      context.state = 'error'
      logger.warn({ err: serializeError(err) }, 'outgoing connection error')
      peerClose(context, logger)
      reject(err)
    })

    context.connection.on('close', () => { peerClose(context, logger) })

    resolve()
  })

  return context.connecting
}

async function peerClose(context, logger) {
  context.state = 'end'
  telemetry.decreaseCount('bitswap-active-connections')

  try {
    context.connection && (await context.connection.close())
    context.connection = null
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#peerClose')
  }

  context.close()
}

function handle({ context, logger, batchSize = config.blocksBatchSize, processing = processingQueue }) {
  return new Promise(resolve => {
    if (context.blocks.length < 1) {
      resolve()
      return
    }

    context.todo = context.blocks.length
    telemetry.increaseCount('bitswap-total-entries', context.todo)
    telemetry.increaseCount('bitswap-pending-entries', context.todo)

    let blocksLength
    context.batches = Math.ceil(context.todo / batchSize)
    do {
      const blocks = context.blocks.splice(0, batchSize)

      if (blocks.length === 0) {
        break
      }

      blocksLength = blocks.length
      processing.add(async () => {
        // state can be error or end
        // in those cases skip fetching and response, iterate pending batches and close
        if (context.state === 'ok') {
          // append content to its block
          const fetched = await batchFetch(blocks, context, logger)
          if (fetched) {
            await batchResponse(fetched, context, logger)
          }
        }

        context.batches--
        if (context.batches < 1) {
          telemetry.decreaseCount('bitswap-pending-entries', context.todo)
          // note: not awaiting
          peerClose(context, logger)
        }
      })
    } while (blocksLength === batchSize)

    // TODO metrics response time

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
      fetchBlocksInfo({ blocks: infoBlocks, logger }),
      fetchBlocksData({ blocks: dataBlocks, logger })
    ])
    return [...infoBlocks, ...dataBlocks]
  } catch (error) {
    logger.error({ error: serializeError(error) }, 'error on handler#batchFetch')
  }
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

async function batchResponse(blocks, context, logger) {
  try {
    if (context.done === 0) {
      await peerConnect(context, logger)
    }

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
}

module.exports = {
  handle, createContext
}
