import config from './config.js'
import { cidToKey, Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA, Message } from 'e-ipfs-core-lib'
import { fetchBlocksData, fetchBlocksInfo } from './storage.js'
import { telemetry } from './telemetry.js'
import { connectPeer } from './networking.js'
import { sizeofBlockInfo } from './util.js'
import { TELEMETRY_TYPE_DATA, TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_CANCELED } from './constants.js'

function createContext ({ service, peerId, protocol, wantlist, awsClient, connection, connectionId }) {
  const context = {
    state: 'ok',
    connection,
    connecting: connection ? Promise.resolve() : null,
    awsClient,
    service,
    peerId,
    protocol,
    wantlist: wantlist.entries,
    done: 0,
    todo: 0,
    batchesTodo: 0,
    batchesDone: 0,
    connectionId,
    inProcessingWantBlocks: new Map(),
    inProcessingWantHaves: new Map()
  }
  return context
}

function handle ({ context, logger, batchSize = config.blocksBatchSize }) {
  return telemetry.trackDuration('bitswap-request-duration',
    new Promise(resolve => {
      if (context.wantlist.length < 1) {
        resolve()
        return
      }

      context.todo = context.wantlist.length
      telemetry.increaseCount('bitswap-total-entries', context.todo)
      telemetry.increaseGauge('bitswap-pending-entries', context.todo)

      let wantlistLength
      context.batchesTodo = Math.ceil(context.todo / batchSize)
      // const hrTime = process.hrtime()
      // const requestId = hrTime[0] * 1000000000 + hrTime[1]

      // telemetry.increaseLabelCount('bitswap-request-size', [context.connectionId, requestId], context.todo)

      do {
        const wantlist = context.wantlist.splice(0, batchSize)
        if (wantlist.length === 0) {
          break
        }
        wantlistLength = wantlist.length

        // normalize wantlist into different wantlist operations
        const normalizedWantlist = getNormalizedWantlist(wantlist, context, logger)

        // Set state of processing blocks
        setProcessingBlocks(normalizedWantlist, context)

        process.nextTick(async () => {
          // catch async error in libp2p connection
          try {
            // state can be 'error' or 'end'
            // in those cases skip fetching and response, iterate pending batches and close
            if (context.state === 'ok') {
              // append content to its block
              const fetched = await batchFetch(normalizedWantlist, context, logger)

              // close connection on last batch
              await batchResponse({ blocks: fetched, context, logger })
            }
          } catch (err) {
            // Cleanup in processing blocks
            clearProcessingBlocks(normalizedWantlist, context)

            // TODO remove? probably not needed
            logger.error({ err }, 'error on handler#nextTick end response')
          }

          try {
            context.batchesDone++
            if (context.batchesDone === context.batchesTodo) {
              endResponse({ context, logger })
              resolve()
            }
          } catch (err) {
            // TODO remove? probably not needed
            logger.error({ err }, 'error on handler#nextTick end response')
          }
        })
      } while (wantlistLength === batchSize)
    }))
}

function getNormalizedWantlist (blocks, context, logger) {
  const wantedBlocks = []
  const wantedHave = []
  const canceled = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const key = cidToKey(block.cid)
    if (!key) {
      logger.error({ block }, 'invalid block cid')
      telemetry.increaseCount('bitswap-block-error')
      continue
    }
    block.key = key

    // Skip block cancel
    if (block.cancel) {
      const type = block.wantType === Entry.WantType.Block
        ? TELEMETRY_TYPE_DATA
        : TELEMETRY_TYPE_INFO
      telemetry.increaseLabelCount('bitswap-block', [type, TELEMETRY_RESULT_CANCELED])
      canceled.push(block)
      continue
    }

    if (block.wantType === Entry.WantType.Block) {
      // telemetry.increaseLabelCount('bitswap-request', [context.connectionId, TELEMETRY_TYPE_DATA])
      block.type = BLOCK_TYPE_DATA
      wantedBlocks.push(block)
      continue
    }
    if (block.wantType === Entry.WantType.Have && context.protocol === BITSWAP_V_120) {
      // telemetry.increaseLabelCount('bitswap-request', [context.connectionId, TELEMETRY_TYPE_INFO])
      block.type = BLOCK_TYPE_INFO
      wantedHave.push(block)
      continue
    }

    // other blocks are stripped and not fetched - and not responded
    logger.error({ block }, 'unsupported block type')
    telemetry.increaseCount('bitswap-block-error')
  }

  return {
    wantedBlocks,
    wantedHave,
    canceled
  }
}

/**
 * fetch blocks content from storage
 * append content to its block
 */
async function batchFetch (wantList, context, logger) {
  const { wantedBlocks, wantedHave } = wantList

  // Fetch blocks
  try {
    await Promise.all([
      fetchBlocksInfo({ blocks: wantedHave, logger, awsClient: context.awsClient }),
      fetchBlocksData({ blocks: wantedBlocks, logger, awsClient: context.awsClient })
    ])
    return [...wantedHave, ...wantedBlocks]
  } catch (err) {
    logger.error({ err }, 'error on handler#batchFetch')

    // guarantee inProcessing cleanup
    throw err
  }
}

async function batchResponse ({ blocks, context, logger }) {
  if (!blocks) {
    return
  }

  try {
    if (!context.connection && !context.connecting) {
      context.connecting = connectPeer({ context, logger })
      context.connection = await context.connecting
      context.connection.on('close', () => {
        endResponse({ context, logger })
      })
    }
    await context.connecting
  } catch (error) {
    context.state = 'error'
    // TODO add metric connection-error
    return
  }

  try {
    let message = new Message()
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const inProcessingMap = getInProcessingMap(block, context)
      const inProcessingBlock = inProcessingMap.get(block.key)

      if (!inProcessingBlock?.cancel) {
        const size = messageSize[block.type](block)

        // maxMessageSize MUST BE larger than a single block info/data
        if (message.size() + size > config.maxMessageSize) {
          await message.send(context)
          message = new Message()
        }

        message.push(block, size, context.protocol)
        sentMetrics[block.type](block, size)
      }

      // Delete in processing blocks
      inProcessingMap.delete(block.key)
    }

    await message.send(context)
    context.done += blocks.length
  } catch (err) {
    logger.error({ err }, 'error on handler#batchResponse')

    // guarantee inProcessing cleanup
    throw err
  }
}

function setProcessingBlocks (wantList, context) {
  const { wantedBlocks, wantedHave, canceled } = wantList
  const now = Date.now()

  canceled.forEach(block => {
    const inProcessing = getInProcessingMap(block, context)

    if (inProcessing.has(block.key)) {
      inProcessing.set(block.key, {
        cancel: now
      })
    }
  })

  // Add new blocks in process
  wantedBlocks.forEach(block => {
    const inProcessing = getInProcessingMap(block, context)

    inProcessing.set(block.key, {})
  })

  wantedHave.forEach(block => {
    const inProcessing = getInProcessingMap(block, context)

    inProcessing.set(block.key, {})
  })
}

function clearProcessingBlocks (wantList, context) {
  const { wantedBlocks, wantedHave } = wantList

  // Clear blocks in process
  wantedBlocks.forEach(block => {
    const inProcessing = getInProcessingMap(block, context)
    inProcessing.delete(block.key)
  })

  wantedHave.forEach(block => {
    const inProcessing = getInProcessingMap(block, context)
    inProcessing.set(block.key)
  })
}

function getInProcessingMap (block, context) {
  return block.wantType === Entry.WantType.Block
    ? context.inProcessingWantBlocks
    : context.inProcessingWantHaves
}

// end response, close connection
async function endResponse ({ context, logger }) {
  if (context.state === 'end') {
    return
  }

  context.state = 'end'

  if (context.connection) {
    try {
      await context.connection.close()
      context.connection.removeAllListeners()
    } catch (err) {
      logger.error({ err }, 'error on close connection handler#endResponse')
    }
  }

  telemetry.decreaseGauge('bitswap-pending-entries', context.todo)
}

const messageSize = {
  [BLOCK_TYPE_DATA]: (block) => block.data?.content?.length ?? 0,
  [BLOCK_TYPE_INFO]: (block) => sizeofBlockInfo(block.info)
}

// not accurate, not considering fixed overhead
const sentMetrics = {
  [BLOCK_TYPE_DATA]: (block, size) => {
    block.data?.found && telemetry.increaseLabelCount('bitswap-sent', [TELEMETRY_TYPE_DATA], size)
  },
  [BLOCK_TYPE_INFO]: (block, size) => {
    block.info?.found && telemetry.increaseLabelCount('bitswap-sent', [TELEMETRY_TYPE_INFO], size)
  }
}

export {
  handle, createContext
}
