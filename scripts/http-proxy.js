'use strict'

// --- FOR BENCHMARK PURPOSE ONLY ---

// npm i --no-save fastify p-queue

// PROXY_PORT=3002 TARGET=local CONCURRENCY=16 node http-proxy

/*

// 1 found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"}]}' \
http://localhost:3002/

// 2 found same cid i+d

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"},{"type":"d","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"d","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"}]}' \
http://localhost:3002/

// 1 not found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBX"}]}' \
http://localhost:3002/

// 1 found, 1 not found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbX"}]}' \
http://localhost:3002/

// TODO concurrent mixed requests, open multiple clients https://github.com/mcollina/autocannon#api

autocannon -a 10 -m POST \
-H "Content-Type":"application/json" \
-b '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"},{"type":"d","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"d","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"}]}' \
http://localhost:3002/

*/

const fastify = require('fastify')
const { Noise } = require('@web3-storage/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { CID } = require('multiformats/cid')
const { sha256 } = require('multiformats/hashes/sha2')
const { base58btc: base58 } = require('multiformats/bases/base58')

const { loadEsmModule } = require('../src/esm-loader')
const { Connection } = require('../src/networking')
const { protocols, Entry, Message, WantList, RawMessage } = require('../src/protocol')
const { logger } = require('../src/logging')
const { startService } = require('../src/service')
const { createAwsClient } = require('../src/aws-client')
const { getPeerId } = require('../src/peer-id')
const config = require('../src/config')

const TARGETS = {
  local: '/ip4/127.0.0.1/tcp/3000/ws/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei',
  prod: '/dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm',
  staging: '/dns4/elastic-staging.dag.house/tcp/443/wss/p2p/bafzbeigjqot6fm3i3yv37wiyybsfblrlsmib7bzlbnkpjxde6fw6b4fvei',
  dev: '/dns4/elastic-dev.dag.house/tcp/443/wss/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei'
}

if (!process.env.TARGET) { process.env.TARGET = 'local' }
process.env.CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 4
process.env.PROXY_PORT = process.env.PROXY_PORT ? parseInt(process.env.PROXY_PORT) : 3002

async function localPeer() {
  // console.log(' *** start local peer ***')
  // console.log({ config })
  try {
    const awsClient = await createAwsClient(config, logger)

    const peerId = await getPeerId({
      awsClient,
      peerIdS3Region: config.peerIdS3Region,
      peerIdS3Bucket: config.peerIdS3Bucket,
      peerIdJsonFile: config.peerIdJsonFile,
      peerIdJsonPath: config.peerIdJsonPath
    })

    await startService({
      awsClient,
      port: config.port,
      peerId,
      peerAnnounceAddr: config.peerAnnounceAddr
    })
  } catch (err) {
    logger.fatal({ err }, 'Cannot start the service')
  }
}

async function main() {
  const PQueue = await loadEsmModule('p-queue')
  const queue = new PQueue({ concurrency: parseInt(process.env.CONCURRENCY) })

  const app = fastify({ logger: false })

  if (process.env.TARGET === 'local') {
    await localPeer()
  }

  const proxy = await proxyPeer(TARGETS[process.env.TARGET])

  app.post('/', (request, response) => {
    if (!Array.isArray(request.body.blocks)) {
      // console.log('invalid blocks')
      response.status(400).send('err')
      return response
    }

    response.type('application/json')

    // TODO close connection on response.send
    queue.add(() => proxyRequest({ proxy, blocks: request.body.blocks, request, response }))
  })

  // TODO
  // app.addHook('onClose', async () => {
  //   await proxy.peerDialConnection?.close()
  //   await proxy.handlerDialConnection?.close()
  // })

  await app.listen({ port: process.env.PROXY_PORT })

  // console.log(` *** proxy server is ready @ ${process.env.PROXY_PORT} ***`)
}

async function proxyPeer(target) {
  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [new Noise()] // no need custom crypto
    }
  })

  const multiaddr = target
  const dialConnection = await node.dial(multiaddr)

  const { stream, protocol } = await dialConnection.newStream(protocols)
  const duplex = new Connection(stream)

  node.handle(protocols, ({ connection: dialConnection, stream }) => {
    const connection = new Connection(stream)

    connection.on('data', data => {
      proxyResponse({ data })
    })

    connection.on('error', error => {
      console.error({ error }, 'connection error')
    })

    // proxy.connection = connection
  })

  const proxy = { node, duplex, protocol }
  return proxy
}

const pendingBlocks = new Map()
const pendingRequests = new Map()

function proxyRequest({ proxy, blocks, request, response }) {
  // console.log(' +++ proxyRequest', request.id)
  blocks = blocks.map(block => ({ cid: CID.parse(block.cid.trim()), type: block.type }))

  const pending = { response, data: [], blocks: new Set() }
  // console.log('pendingRequests.set', request.id)
  pendingRequests.set(request.id, pending)

  const entries = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const cid = block.cid
    let id
    if (block.type === 'd') {
      id = 'd:' + cid
      entries.push(new Entry(cid, 1, false, Entry.WantType.Block, true))
    } else {
      id = 'i:' + cid
      entries.push(new Entry(cid, 1, false, Entry.WantType.Have, true))
    }

    pending.blocks.add(id)
    // console.log('pendingBlocks.get', id)
    const c = pendingBlocks.get(id)
    if (c) {
      // console.log('pendingBlocks.get - push', request.id)
      c.push(request.id)
    } else {
      // console.log('pendingBlocks.get - set', request.id)
      pendingBlocks.set(id, [request.id])
    }
  }

  proxy.duplex.send(
    new Message(new WantList(entries, false), [], [], 0).encode(proxy.protocol)
  )
}

function proxyResponse({ data }) {
  const message = RawMessage.decode(data)
  const blocks = message.blocks.map(block => ({ type: 'i', block }))
    .concat(message.blockPresences.map(block => ({ type: 'i', block })))
    .concat(message.payload.map(block => ({ type: 'd', block })))

  for (let i = 0; i < blocks.length; i++) {
    const { type, block } = blocks[i]
    let cid, id
    if (type === 'i') {
      cid = base58.encode(block.cid)
      if (cid[0] === 'z') { cid = cid.substring(1) }
      id = 'i:' + cid
    } else {
      cid = CID.create(block.prefix[0], block.prefix[1], sha256.digest(block.data)).toString()
      id = 'd:' + cid
    }

    // console.log('pendingBlocks.get', id)
    const requestIds = pendingBlocks.get(id)
    if (!requestIds) {
      console.error('!!! block not found in pending blocks', id)
      continue
    }

    let requestId
    while (requestIds.length > 0) {
      requestId = requestIds.shift()
      // console.log('pendingRequests.get', requestId)
      const r = pendingRequests.get(requestId)
      if (!r) {
        console.error('!!! request not found for block', { requestId, id })
        continue
      }

      if (!r.blocks.delete(id)) {
        // is it possible?
        console.error('!!! block not in request', { requestId, id })
      }

      r.data.push(serialize(cid, block, type)) // TODO - stream ?

      if (r.blocks.size < 1) {
        r.response.send(JSON.stringify(r.data))
        pendingRequests.delete(requestId)
      }
    }

    // check because may got other request for the same block meanwhile? this code is sync
    if (pendingBlocks.get(id)?.length < 1) {
      // console.log('SHOULD pendingBlocks.delete', id)
      // pendingBlocks.delete(id)
    }
  }
}

function serialize(cid, block, type) {
  return type === 'd'
    ? { cid, data: block.data.toString('base64') }
    : { cid, data: block.type === 0 ? 'FOUND' : 'NOT-FOUND' }
}

main()
