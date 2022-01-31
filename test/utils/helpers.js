'use strict'

const { NOISE } = require('@chainsafe/libp2p-noise')
const dagPB = require('@ipld/dag-pb')
const { EventEmitter } = require('events')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { CID } = require('multiformats/cid')
const { equals } = require('multiformats/hashes/digest')
const { sha256 } = require('multiformats/hashes/sha2')
const getPort = require('get-port')
const { startService } = require('../../src/service')
const { RawMessage, Message } = require('../../src/protocol')
const { Connection } = require('../../src/networking')

// cid1 and cid2 exists, the other two don't, cid1 is a raw block, cid2 is a dag-pb
const cid1 = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
const cid2 = CID.parse('bafybeif2am3yngj2faybsxggkh2twyxe52ijzg7orb2ofsngpebpurbkde')
const cid3 = CID.parse('bafybeiccfclkdtucu6y4yc5cpr6y3yuinr67svmii46v5cfcrkp47ihehy')
const cid4 = CID.parse('bafybeihfg3d7rdltd43u3tfvncx7n5loqofbsobojcadtmokrljfthuc7y')

// cid5, cid6 and cid7 are raw blocks of 1.5MB each so they will be splitted, cid8 is over 2 MB so it's never sent back
const cid5 = CID.parse('bafkreih3qyek7a5z7oxdumyzxzsgn42h6ixikv5tp6ae6brrnzjjsai7tq')
const cid6 = CID.parse('bafkreiazgnbcngapyt5biagk4ckxbwxxlfpaef2ml6msei465352nkyoka')
const cid7 = CID.parse('bafkreicxxkhmz75hzusvw5ouryqidnhlek2ixrlqlghjzp724p4xq3unti')
const cid8 = CID.parse('bafkreigf7cgkeki5favqpdyrxosouw6jw3bo4bsfag6qxx3v2gc5jag46m')

// cid9 is 500 byte less than the block limit
const cid9 = CID.parse('bafkreieezcbuz6d2otuscqyv6xhmhd5walvwehvat7uk66nb6k2rksc7ia')

let currentPort = 53000 + parseInt(process.env.TAP_CHILD_ID) * 100

async function createClient(peerId, port, protocol) {
  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [NOISE]
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

  return { connection, stream, receiver }
}

function getFreePort() {
  return getPort({ port: currentPort++ })
}

async function prepare(protocol) {
  const port = await getFreePort()

  const { peerId, service } = await startService(port)
  const { connection: client, stream, receiver } = await createClient(peerId, port, protocol)

  const connection = new Connection(stream)

  return { service, client, connection, receiver }
}

async function teardown(client, service, connection) {
  await connection.close()
  await client.close()
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
  cid1,
  cid2,
  cid3,
  cid4,
  cid5,
  cid6,
  cid7,
  cid8,
  cid9,
  cid1Content: '1234\n',
  cid2Link: 'abc',
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
