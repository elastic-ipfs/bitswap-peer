'use strict'

const dagPB = require('@ipld/dag-pb')
const { EventEmitter } = require('events')
const { equals } = require('multiformats/hashes/digest')
const { sha256 } = require('multiformats/hashes/sha2')

const { loadEsmModule, loadEsmModules } = require('../../src/esm-loader')
const { Connection } = require('../../src/networking')
// const { noiseCrypto } = require('../../src/noise-crypto')
const { Message, RawMessage } = require('../../src/protocol')
const { startService } = require('../../src/service')
const { mockAWS } = require('./mock')

let currentPort = 53000 + parseInt(process.env.TAP_CHILD_ID) * 100

async function createClient(peerId, port, protocol) {
  const [{ createLibp2p }, { WebSockets }, { Noise }, { Mplex }] = await loadEsmModules(['libp2p', '@libp2p/websockets', '@chainsafe/libp2p-noise', '@libp2p/mplex'])

  const node = await createLibp2p({
    transports: [new WebSockets()],
    streamMuxers: [new Mplex()],
    connectionEncryption: [new Noise()]
    // TODO connectionEncryption: [new Noise(null, null, noiseCrypto)]
  })

  const connection = await node.dial(`/ip4/127.0.0.1/tcp/${port}/ws/p2p/${peerId.toString()}`)
  const { stream } = await connection.newStream(protocol)
  const receiver = new EventEmitter()

  node.handle(protocol, async ({ connection: dialConnection, stream, protocol }) => {
    const connection = new Connection(stream)

    connection.on('data', data => {
      receiver.emit('message', data)
    })
  })

  return { stream, receiver, node }
}

async function getFreePort() {
  const getPort = await loadEsmModule('get-port')
  return getPort({ port: currentPort++ })
}

async function prepare(t, protocol, dispatcher) {
  const { createEd25519PeerId } = await loadEsmModule('@libp2p/peer-id-factory')

  const peerId = await createEd25519PeerId()
  const port = await getFreePort()

  if (!dispatcher) {
    dispatcher = await mockAWS(t)
  }

  const { service } = await startService({ peerId, currentPort: port, dispatcher })
  const { stream, receiver, node } = await createClient(peerId, port, protocol)

  const connection = new Connection(stream)

  return { service, client: node, connection, receiver }
}

async function teardown(t, client, service, connection) {
  await connection.close()
  await client.stop()
  await service.stop()
}

async function receiveMessages(receiver, protocol, timeout = 10000, limit = 1, raw = false) {
  let timeoutHandle
  const responses = []

  return new Promise((resolve, reject) => {
    let resolved = false

    timeoutHandle = setTimeout(() => {
      if (resolved) {
        return
      }

      resolved = true
      resolve(responses)
    }, timeout)

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
    clearTimeout(timeoutHandle)
    receiver.removeAllListeners('message')
  })
}

function getPresence(t, response, cid) {
  const presences = response.blockPresences.filter(b => b.cid.equals(cid))

  t.equal(presences.length, 1)

  return presences[0]
}

function hasDAGBlock(t, response, link, times) {
  const found = response.blocks.filter(b => safeGetDAGLinks(b)?.[0]?.Name === link)

  t.equal(found.length, times)
}

function hasRawBlock(t, response, content, times) {
  const blocks = response.blocks.filter(b => b.data.toString() === content)

  t.equal(blocks.length, times)
}

async function hasBlockWithHash(t, response, multihash, hasNot, times) {
  const hashes = await Promise.all(response.blocks.map(b => sha256.digest(b.data)))

  t.equal(hashes.filter(h => equals(h, multihash)).length, hasNot ? 0 : times)
}

function hasSingleDAGBlock(t, response, link) {
  hasDAGBlock(t, response, link, 1)
}

function hasSingleRawBlock(t, response, content) {
  hasRawBlock(t, response, content, 1)
}

async function hasSingleBlockWithHash(t, response, multihash, hasNot) {
  await hasBlockWithHash(t, response, multihash, hasNot, 1)
}

function safeGetDAGLinks(block) {
  try {
    return Object.values(dagPB.decode(Buffer.isBuffer(block) ? block : block.data).Links)
  } catch (e) {
    return [{}]
  }
}

module.exports = {
  createClient,
  getFreePort,
  getPresence,
  hasBlockWithHash,
  hasDAGBlock,
  hasRawBlock,
  hasSingleBlockWithHash,
  hasSingleDAGBlock,
  hasSingleRawBlock,
  prepare,
  receiveMessages,
  safeGetDAGLinks,
  teardown
}
