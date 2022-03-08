#!/usr/bin/env node

'use strict'

const { NOISE } = require('@chainsafe/libp2p-noise')
const { readFileSync, writeFileSync } = require('fs')
const { load } = require('js-yaml')
const { build: buildHistogram } = require('hdr-histogram-js')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { CID } = require('multiformats/cid')
const { sha256 } = require('multiformats/hashes/sha2')
const { join, basename } = require('path')

const { logger, serializeError } = require('../src/logging')
const { Connection } = require('../src/networking')
const { protocols, Entry, Message, WantList, BlockPresence } = require('../src/protocol')

const percentiles = [0.001, 0.01, 0.1, 1, 2.5, 10, 25, 50, 75, 90, 97.5, 99, 99.9, 99.99, 99.999]

function finalizeResults(blocks, context) {
  const histogram = buildHistogram({
    lowestDiscernibleValue: 1,
    highestTrackableValue: 1e9,
    numberOfSignificantValueDigits: 5
  })

  for (const [block, elapsed] of blocks) {
    if (context.verify) {
      const cid = CID.create(1, block.prefix[1], sha256.digest(block.data)).toString()

      if (!context.cids.has(cid)) {
        logger.error({ cid }, `Received unexpected CID: ${cid}, aborting ...`)
        process.exit(1)
      }
    }

    histogram.recordValue(elapsed)
  }

  const { minNonZeroValue: min, maxValue: max, mean, stdDeviation: stdDev, totalCount: count } = histogram

  const results = {
    count,
    min,
    max,
    mean,
    stdDev,
    stdError: stdDev / Math.sqrt(count),
    percentiles: percentiles.reduce((accu, percentile) => {
      accu[percentile] = histogram.getValueAtPercentile(percentile)
      return accu
    }, {})
  }

  writeFileSync(
    join(process.cwd(), `load-test-${basename(context.configurationFile, '.yml')}-${Date.now}.json`),
    JSON.stringify({ configurationFile: context.configurationFile, results }, null, 2),
    'utf-8'
  )

  logger.info({ results }, `All blocks received in ${Number(process.hrtime.bigint() - context.start) / 1e6} ms.`)
}

function handleResponse(context) {
  let pendingBlocks = context.cids.size
  const blocks = []

  context.node.handle(protocols, async ({ connection: dialConnection, stream, protocol }) => {
    const connection = new Connection(stream)

    connection.on('data', async data => {
      const elapsed = Number(process.hrtime.bigint() - context.start) / 1e6
      const decoded = Message.decode(data)

      // If there were any presences, then the remote peer won't serve all the data we're asking for. Aborting
      if (decoded.blockPresences.length) {
        const missing = decoded.blockPresences
          .filter(b => b.type === BlockPresence.Type.DontHave)
          .map(b => b.cid.toString())
        const unexpected = decoded.blockPresences
          .filter(b => b.type !== BlockPresence.Type.DontHave)
          .map(b => b.cid.toString())

        logger.error({ missing, unexpected }, 'Received unexpected block presences. Aborting ...')
        await dialConnection.close()
        return
      }

      // Associate a block with a time
      for (const block of decoded.blocks) {
        blocks.push([block, elapsed])
        pendingBlocks--
      }

      if (pendingBlocks > 0) {
        return
      }

      logger.debug('All data received, closing the connection.')
      await dialConnection.close()
      finalizeResults(blocks, context)
    })

    connection.on('error', error => {
      logger.error({ error }, `Connection error: ${serializeError(error)}`)
      process.exit(0)
    })
  })
}

async function client() {
  // Decode the configuration file
  if (!process.argv[2]) {
    console.error(`Use: ${process.argv[1]} yaml-configuration-file`)
    process.exit(1)
  }

  // Parse the configuration
  const configurationFile = join(process.cwd(), process.argv[2])
  const configuration = load(readFileSync(join(process.cwd(), process.argv[2]), 'utf-8'))
  const cids = new Set(configuration.cids)

  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [NOISE]
    }
  })

  // Connect to the BitSwap peer
  logger.info(`Connecting to ${configuration.target} ...`)
  const connectionStart = process.hrtime.bigint()
  const dialConnection = await node.dial(configuration.target)
  const connectDuration = Number(process.hrtime.bigint() - connectionStart) / 1e6
  logger.info({ id: 'connection', duration: connectDuration }, `Connected in ${connectDuration} ms.`)

  // Prepare the BitSwap handler to receive response
  const { stream, protocol } = await dialConnection.newStream(protocols)
  const duplex = new Connection(stream)

  const responseContext = {
    configurationFile,
    node,
    start: 0,
    cids,
    verify: configuration.verify ?? process.env.VERIFY === 'true'
  }

  handleResponse(responseContext)

  // Send the only request
  logger.debug(`Sending the WantList (${configuration.cids.length} CIDs) ...`)
  const wantlist = new Message(
    new WantList(
      Array.from(cids).map(c => new Entry(CID.parse(c), 1, false, Entry.WantType.Block, true)),
      false
    ),
    [],
    [],
    0
  ).encode(protocol)

  const sendStart = process.hrtime.bigint()
  duplex.send(wantlist)
  const sendDuration = Number(process.hrtime.bigint() - sendStart) / 1e6

  logger.info({ id: 'send', duration: sendDuration }, `WantList sent in ${sendDuration} ms.`)
  responseContext.start = process.hrtime.bigint()
}

client()
