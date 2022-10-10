'use strict'

const PeerId = require('peer-id')
const t = require('tap')

const config = require('../src/config')
const { Connection, PeerConnectionPool } = require('../src/networking')
const { BITSWAP_V_100: protocol } = require('../src/protocol')
const { startService } = require('../src/service')
const helper = require('./utils/helper')
const { mockAWS } = require('./utils/mock')

t.test('send - after closing behavior', async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection } = await helper.setup({ protocol, awsClient })

  connection.close()

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  // Sending is rejected
  t.throws(() => connection.send('ANYTHING'), { message: 'The stream is closed.' })

  // Nothing is returned
  t.strictSame(await connection[Symbol.asyncIterator]().next(), { done: true, value: undefined })

  await helper.teardown(client, service, connection)
})

t.test('error handling', async t => {
  const peerId = await PeerId.create()
  const { port, service } = await startService({ peerId, port: await helper.getFreePort(), connectionPool: new PeerConnectionPool() })
  const { stream, node: client } = await helper.createClient(peerId, port, protocol)

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
  connection.on('error', () => { })

  const receiveError = new Promise(resolve => {
    connection.once('error:receive', resolve)
  })

  const sendError = new Promise(resolve => {
    connection.once('error:send', resolve)
  })

  connection.send('ANYTHING')

  t.equal((await receiveError).message, 'SOURCE ERROR')
  t.equal((await sendError).message, 'SINK ERROR')

  await helper.teardown(client, service, connection)
})

t.test('announced multiaddr', async t => {
  const peerAnnounceAddr = '/dns4/example.com/tcp/3000/ws'
  const peerId = await PeerId.create()
  const { port, service } = await startService({ peerId, port: await helper.getFreePort(), peerAnnounceAddr, connectionPool: new PeerConnectionPool() })
  const { stream, node: client } = await helper.createClient(peerId, port, protocol)

  const connection = new Connection(stream)
  connection.on('error', () => { })

  // libp2p needs a tick to store announced addresses in peer store
  await new Promise(resolve => setTimeout(resolve))

  const peer = client.peerStore.get(peerId)
  t.ok(peer, `${peerId} exists in peer store`)

  const isAnnounced = peer.addresses.some(a => a.multiaddr.toString().startsWith(peerAnnounceAddr))
  t.ok(isAnnounced, `${peerAnnounceAddr} is announced`)

  await helper.teardown(client, service, connection)
})

// TODO PeerConnectionPool
