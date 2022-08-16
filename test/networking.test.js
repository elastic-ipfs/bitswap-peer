'use strict'

process.env.LOG_LEVEL = 'fatal'

const t = require('tap')

const { loadEsmModule } = require('../src/esm-loader')
const { Connection } = require('../src/networking')
const { BITSWAP_V_100: protocol } = require('../src/protocol')
const { startService } = require('../src/service')
const { getFreePort, createClient, prepare, teardown } = require('./utils/helpers')

let createEd25519PeerId
t.before(async () => {
  createEd25519PeerId = (await loadEsmModule('@libp2p/peer-id-factory')).createEd25519PeerId
})

t.test('send - after closing behavior', async t => {
  const { client, service, connection } = await prepare(t, protocol)

  connection.close()

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  // Sending is rejected
  t.throws(() => connection.send('ANYTHING'), { message: 'The stream is closed.' })

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  await teardown(t, client, service, connection)
})

t.test('error handling', async t => {
  t.plan(2)

  const peerId = await createEd25519PeerId()
  const { port, service } = await startService({ peerId, currentPort: await getFreePort() })
  const { stream, node: client } = await createClient(peerId, port, protocol)

  stream.source[Symbol.asyncIterator] = function () {
    return {
      next: () => {
        return Promise.reject(new Error('SOURCE ERROR'))
      }
    }
  }

  stream.sink = function () {
    return Promise.reject(new Error('SINK ERROR'))
  }

  const connection = new Connection(stream)
  connection.on('error', () => {})

  const receiveError = new Promise(resolve => {
    connection.once('error:receive', resolve)
  })

  const sendError = new Promise(resolve => {
    connection.once('error:send', resolve)
  })

  connection.send('ANYTHING')

  t.equal((await receiveError).message, 'SOURCE ERROR')
  t.equal((await sendError).message, 'SINK ERROR')

  await teardown(t, client, service, connection)
})

t.test('announced multiaddr', async t => {
  t.plan(2)

  const announceAddr = '/dns4/example.com/tcp/3000/ws'
  const peerId = await createEd25519PeerId()
  const { port, service } = await startService({ peerId, currentPort: await getFreePort(), announceAddr })
  const { stream, node: client } = await createClient(peerId, port, protocol)

  const connection = new Connection(stream)
  connection.on('error', () => {})

  // libp2p needs a tick to store announced addresses in peer store
  await new Promise(resolve => setTimeout(resolve))

  const peer = client.peerStore.get(peerId)
  t.ok(peer, `${peerId} exists in peer store`)

  const isAnnounced = peer.addresses.some(a => a.multiaddr.toString().startsWith(announceAddr))
  t.ok(isAnnounced, `${announceAddr} is announced`)

  await teardown(t, client, service, connection)
})
