'use strict'

const { NOISE } = require('@chainsafe/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { CID } = require('multiformats/cid')
const getPort = require('get-port')
const { main } = require('../src/index')
const { RawMessage, Message } = require('../src/message')
const { receiveData } = require('../src/networking')

// cid1 and cid2 exists, the other two don't
const cid1 = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
const cid2 = CID.parse('bafybeigt3wlrvzpanhazlpumeoz2ya4tmkrjhaq6ulvlbw5y4hlfzhidvm')
const cid3 = CID.parse('bafybeiccfclkdtucu6y4yc5cpr6y3yuinr67svmii46v5cfcrkp47ihehy')
const cid4 = CID.parse('bafybeihfg3d7rdltd43u3tfvncx7n5loqofbsobojcadtmokrljfthuc7y')

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

  return { connection, stream }
}

async function prepare(protocol) {
  const port = await getPort()
  const { peerId, server } = await main(port)
  const { connection: client, stream } = await createClient(peerId, port, protocol)

  return { server, client, stream }
}

async function receiveMessages(stream, protocol, timeout = 5000, limit = 1, raw = false) {
  const responses = []

  // Return all the response we receive in a certain timeout
  return new Promise((resolve, reject) => {
    let resolved = false

    setTimeout(() => {
      if (resolved) {
        return
      }

      resolved = true
      resolve(responses)
    }, timeout)

    receiveData(stream, data => {
      if (resolved) {
        return
      }

      try {
        responses.push(raw ? RawMessage.decode(data.slice()) : Message.decode(data.slice(), protocol))

        if (responses.length === limit) {
          resolved = true
          resolve(responses)
        }
      } catch (e) {
        resolved = true
        reject(e)
      }
    })
  })
}

module.exports = {
  cid1,
  cid2,
  cid3,
  cid4,
  cid1Content: '1234\n',
  cid2Link: 'abc',
  prepare,
  receiveMessages
}
