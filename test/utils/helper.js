
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { yamux } from '@chainsafe/libp2p-yamux'
import * as dagPB from '@ipld/dag-pb'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { EventEmitter } from 'events'
import { equals } from 'multiformats/hashes/digest'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import { base58btc as base58 } from 'multiformats/bases/base58'
import getPort from 'get-port'

import config from '../../src/config.js'
import { Connection } from '../../src/networking.js'
import { noiseCrypto } from '../../src/noise-crypto.js'
import { Message, RawMessage } from 'e-ipfs-core-lib'
import { startService } from '../../src/service.js'
import { createConnectionConfig } from '../../src/util.js'

async function createClient (service, protocol, muxers = ['yamux', 'mplex']) {
  const streamMuxers = []
  if (muxers.includes('yamux')) {
    streamMuxers.push(yamux({ client: true }))
  }
  if (muxers.includes('mplex')) {
    streamMuxers.push(mplex())
  }

  const client = await createLibp2p({
    transports: [webSockets()],
    connectionEncryption: [noise({ crypto: noiseCrypto })],
    streamMuxers
  })

  await client.peerStore.addressBook.set(service.peerId, service.getMultiaddrs())
  const target = await client.dial(service.peerId)
  const stream = await target.newStream(protocol)
  const receiver = new EventEmitter()

  client.handle(protocol, async ({ stream }) => {
    const connection = new Connection(stream)

    connection.on('data', data => {
      receiver.emit('message', data)
    })
  }, { maxInboundStreams: Infinity, maxOutboundStreams: Infinity })

  return { stream, receiver, client }
}

async function getFreePort () {
  return getPort()
}

async function setup ({ protocol, awsClient, muxers = ['yamux', 'mplex'] }) {
  const peerId = await createEd25519PeerId()
  const port = await getFreePort()
  const logger = spyLogger()
  const connectionConfig = createConnectionConfig(config)
  const { service } = await startService({ peerId, port, awsClient, logger, connectionConfig })
  const { stream, receiver, client } = await createClient(service, protocol, muxers)
  const connection = new Connection(stream)

  return { service, client, connection, receiver, logger }
}

async function teardown (client, service, connection) {
  await connection.close()
  await client.stop()
  await service.stop()
}

// TODO remove hard timeouts
async function receiveMessages (receiver, protocol, timeout = 1000, limit = 1, raw = false) {
  let timeoutHandle
  const responses = []

  return new Promise((resolve, reject) => {
    let resolved = false

    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        if (resolved) {
          return
        }

        resolved = true
        resolve(responses)
      }, timeout)
    }

    // Return all the response we receive in a certain timeout
    receiver.on('message', message => {
      if (resolved) {
        return
      }

      try {
        responses.push(raw ? RawMessage.decode(message) : Message.decode(message, protocol))

        if (responses.length === limit) {
          resolved = true
          resolve(responses)
        }
      } catch (e) {
        resolved = true
        reject(e)
      }
    })
  }).finally(() => {
    timeoutHandle && clearTimeout(timeoutHandle)
    receiver.removeAllListeners('message')
  })
}

function getPresence (t, response, cid) {
  const presences = response.blockPresences.filter(b => b.cid.equals(cid))

  t.equal(presences.length, 1)

  return presences[0]
}

function hasDAGBlock (t, response, link, times) {
  const found = response.blocks.filter(b => safeGetDAGLinks(b)?.[0]?.Name === link)

  t.equal(found.length, times)
}

function hasRawBlock (t, response, content, times) {
  const blocks = response.blocks.filter(b => Buffer.from(b.data).toString('utf8') === content)

  t.equal(blocks.length, times)
}

async function hasBlockWithHash (t, response, multihash, hasNot, times) {
  const hashes = await Promise.all(response.blocks.map(b => sha256.digest(b.data)))

  t.equal(hashes.filter(h => equals(h, multihash)).length, hasNot ? 0 : times)
}

async function hasSingleBlockWithHash (t, response, multihash, hasNot) {
  await hasBlockWithHash(t, response, multihash, hasNot, 1)
}

function safeGetDAGLinks (block) {
  try {
    return Object.values(dagPB.decode(block).Links)
  } catch (err) {
    return []
  }
}

function decodeCidToKey (cid) {
  return base58.encode(CID.decode(cid).multihash.bytes)
}

function decodeMessage (message) {
  const { blockPresences: blocksInfo, payload: blocksData } = RawMessage.decode(message)

  return {
    blocksInfo: blocksInfo.map(b => ({
      key: decodeCidToKey(b.cid),
      type: b.type
    })),
    blocksData: blocksData.map(b => ({
      cid: CID.create(b.prefix[0], b.prefix[1], sha256.digest(b.data)).toString(),
      data: b.data.toString('utf8')
    }))
  }
}

function dummyLogger () {
  return { fatal: noop, error: noop, warn: noop, info: noop, debug: noop }
}

function spyLogger () {
  const spy = { messages: {} }
  for (const l of ['fatal', 'error', 'error', 'warn', 'info', 'debug']) {
    spy.messages[l] = []
    spy[l] = (...args) => { spy.messages[l].push(args) }
  }
  return spy
}

function noop () { }

export {
  dummyLogger,
  spyLogger,
  createClient,
  getFreePort,
  getPresence,
  hasBlockWithHash,
  hasDAGBlock,
  hasRawBlock,
  hasSingleBlockWithHash,
  setup,
  receiveMessages,
  safeGetDAGLinks,
  decodeMessage,
  teardown
}
