'use strict'

const { Noise } = require('@web3-storage/libp2p-noise')
const dagPB = require('@ipld/dag-pb')
const { EventEmitter } = require('events')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { equals } = require('multiformats/hashes/digest')
const { sha256 } = require('multiformats/hashes/sha2')
const PeerId = require('peer-id')

const { loadEsmModule } = require('../../src/esm-loader')
const { Connection } = require('../../src/networking')
const { noiseCrypto } = require('../../src/noise-crypto')
const { Message, RawMessage } = require('../../src/protocol')
const { startService } = require('../../src/service')

let currentPort = 53000 + parseInt(process.env.TAP_CHILD_ID) * 100

async function createClient(peerId, port, protocol) {
  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [new Noise(null, null, noiseCrypto)]
    }
  })

  const connection = await node.dial(`/ip4/127.0.0.1/tcp/${port}/ws/p2p/${peerId}`)
  const { stream } = await connection.newStream(protocol)
  const receiver = new EventEmitter()

  node.handle(protocol, async ({ connection: dialConnection, stream, protocol }) => {
    const connection = new Connection(stream)

    connection.on('data', data => {
      receiver.emit('message', data)
    })
  })

  return { connection, stream, receiver, node }
}

async function getFreePort() {
  const getPort = await loadEsmModule('get-port')
  return getPort({ port: currentPort++ })
}

async function prepare(t, protocol) {
  const peerId = await PeerId.create()
  const port = await getFreePort()

  const { service } = await startService({ peerId, currentPort: port })
  const { stream, receiver, node } = await createClient(peerId, port, protocol)

  const connection = new Connection(stream)

  return { service, client: node, connection, receiver }
}

async function teardown(t, client, service, connection) {
  await Promise.allSettled([connection.close(), client.stop(), service.stop()])
}

// TODO remove hardcoded timers
async function receiveMessages(receiver, protocol, timeout = 2000, limit = 1, raw = false) {
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
  hasSingleBlockWithHash,
  hasSingleDAGBlock,
  hasSingleRawBlock,
  prepare,
  receiveMessages,
  safeGetDAGLinks,
  teardown
}
