'use strict'

const { NOISE } = require('@chainsafe/libp2p-noise')
const libp2p = require('libp2p')
const Gossipsub = require('libp2p-gossipsub')
const Multiplex = require('libp2p-mplex')
const TCP = require('libp2p-tcp')
const { Multiaddr } = require('multiaddr')
const { base58btc } = require('multiformats/bases/base58')
const { CID } = require('multiformats/cid')
const varint = require('varint')
const { request } = require('undici')

const { getPeerId } = require('../src/config')

async function client() {
  const peerId = await getPeerId()

  const node = await libp2p.create({
    modules: {
      transport: [TCP],
      streamMuxer: [Multiplex],
      connEncryption: [NOISE]
    }
  })

  const gsub = new Gossipsub(node, {
    directPeers: [
      {
        id: peerId,
        addrs: [new Multiaddr('/ip4/127.0.0.1/tcp/3103')]
      }
    ]
  })

  // Start
  await gsub.start()

  gsub.on('indexer/ingest', async data => {
    try {
      const [cid, raw] = CID.decodeFirst(data.data)
      console.log(`Received advertisement for CID ${cid.toString()}, asking for its contents ...`)

      const length = varint.decode(raw)
      const start = varint.decode.bytes
      const multiaddr = new Multiaddr(raw.slice(start, start + length))
      const isHttps = multiaddr.protoNames().includes('https')
      const baseUrl = new URL(`http${isHttps ? 's' : ''}://${multiaddr.toOptions().host}`)

      // Fetch the advertisement contents
      baseUrl.pathname = cid.toString()
      let { body } = await request(baseUrl)

      let response = Buffer.alloc(0)
      for await (const chunk of body) {
        response = Buffer.concat([response, chunk])
      }

      const contents = JSON.parse(response.toString('utf-8'))
      console.log(`Received advertisement contents for CID ${cid.toString()}`, contents)

      // Fetch the entries contents
      console.log(`Fetching entries from CID ${contents.Entries['/']} ...`)
      baseUrl.pathname = contents.Entries['/']

      body = (await request(baseUrl)).body
      response = Buffer.alloc(0)
      for await (const chunk of body) {
        response = Buffer.concat([response, chunk])
      }

      const entries = JSON.parse(response.toString('utf-8')).map(e =>
        base58btc.encode(Buffer.from(e['/'].bytes, 'base64'))
      )

      console.log(`Received advertisement contents for CID ${contents.Entries['/']}`, entries)
    } catch (e) {
      console.error(e)
    }
  })
  gsub.subscribe('indexer/ingest')
}

client()
