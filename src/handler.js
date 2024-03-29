import config from './config.js'
import { cidToKey, Entry, BITSWAP_V_120, BLOCK_TYPE_INFO, BLOCK_TYPE_DATA, Message } from 'e-ipfs-core-lib'
import { fetchBlocksData, fetchBlocksInfo } from './storage.js'
import { telemetry } from './telemetry.js'
import { connectPeer } from './networking.js'
import { sizeofBlockInfo } from './util.js'
import { TELEMETRY_TYPE_DATA, TELEMETRY_TYPE_INFO, TELEMETRY_RESULT_CANCELED } from './constants.js'

function createContext ({ service, peerId, protocol, wantlist, awsClient, connection, connectionId, canceled }) {
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
    canceled
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

        // Set state of processing blocks in canceled state
        updateCanceledState(normalizedWantlist, context)

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
      const canceledItem = context.canceled.get(block.key)
      const size = messageSize[block.type](block)

      if (canceledItem === block.wantType) {
        telemetry.increaseLabelCount('bitswap-block-success-cancel', [block.type])
        telemetry.increaseLabelCount('bitswap-cancel-size', [block.type], size)

        context.canceled.delete(block.key)
      } else {
        if (block.type === BLOCK_TYPE_DATA) {
          const prefix = getPrefixMetricData(block.cid)
          telemetry.increaseLabelCount('bitswap-sent-cid-prefix', [
            prefix.version,
            prefix.code,
            prefix.multihash.code,
            prefix.multihash.size
          ])
        }

        // maxMessageSize MUST BE larger than a single block info/data
        if (message.size() + size > config.maxMessageSize) {
          await message.send(context)
          message = new Message()
        }

        message.push(block, size, context.protocol)
        sentMetrics[block.type](block, size)
      }
    }

    await message.send(context)
    context.done += blocks.length
  } catch (err) {
    logger.error({ err }, 'error on handler#batchResponse')

    // guarantee inProcessing cleanup
    throw err
  }
}

function updateCanceledState (wantList, context) {
  const { wantedBlocks, wantedHave, canceled } = wantList

  // Removed previous canceled blocks
  wantedBlocks.forEach(block => {
    context.canceled.delete(block.key)
  })

  wantedHave.forEach(block => {
    context.canceled.delete(block.key)
  })

  // Add new canceled blocks
  canceled.forEach(block => {
    context.canceled.set(block.key, block.wantType)
  })
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

const IpldCodecs = { 85: 'raw', 112: 'dag-pb', 113: 'dag-cbor', 297: 'dag-json' }
const MultihashCodecs = { 18: 'sha2-256', 45600: 'blake2b-256' }
const HashSizes = { 32: '32' }

/** @param {import('multiformats').CID} cid */
function getPrefixMetricData (cid) {
  return {
    version: cid.version.toString(),
    code: IpldCodecs[cid.code] || 'other',
    multihash: {
      code: MultihashCodecs[cid.multihash.code] || 'other',
      size: HashSizes[cid.multihash.size] || 'other'
    }
  }
}

export {
  handle, createContext
}
