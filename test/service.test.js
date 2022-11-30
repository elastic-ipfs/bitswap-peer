
import t from 'tap'

import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import getPort from 'get-port'
import config from '../src/config.js'
import { BITSWAP_V_100 as protocol, Entry, Message, WantList } from 'e-ipfs-core-lib'
import { cid1, cid1Content, cid2 } from './fixtures/cids.js'
import * as helper from './utils/helper.js'
import { mockAWS, createMockAgent } from './utils/mock.js'
import { startService } from '../src/service.js'
import { createConnectionConfig } from '../src/util.js'

t.test('service - config properly passed to libp2p createLibp2p method', async t => {
  const { awsClient } = await mockAWS(config)
  const peerId = await createEd25519PeerId()
  const port = await getPort()

  const { service } = await startService({
    awsClient,
    port,
    peerId,
    connectionConfig: {
      p2p: {
        maxConnections: 123,
        minConnections: 9,
        pollInterval: 789,
        inboundConnectionThreshold: 654,
        maxIncomingPendingConnections: 321,
        inboundUpgradeTimeout: 987,
        autoDial: false,
        autoDialInterval: 852,
        maxInboundStreams: 4123,
        maxOutboundStreams: 5123,
        maxStreamBufferSize: 6123
      },
      mplex: {
        maxInboundStreams: 9,
        maxOutboundStreams: 8,
        maxStreamBufferSize: 7
      },
      handler: {
        maxInboundStreams: 3,
        maxOutboundStreams: 4
      },
      taggedPeers: [{ name: 'tagged', peer: (await createEd25519PeerId()).toString() }]
    }
  })

  // p2p
  t.equal(service.components.connectionManager.opts.maxConnections, 123)
  t.equal(service.components.connectionManager.opts.minConnections, 9)
  t.equal(service.components.connectionManager.opts.pollInterval, 789)
  t.equal(service.components.connectionManager.opts.inboundConnectionThreshold, 654)
  t.equal(service.components.connectionManager.opts.maxIncomingPendingConnections, 321)
  t.equal(service.components.connectionManager.opts.inboundUpgradeTimeout, 987)
  t.equal(service.components.connectionManager.opts.autoDial, false)
  t.equal(service.components.connectionManager.opts.autoDialInterval, 852)

  service.stop()
})

t.test('service - blocks are cached', async t => {
  // TODO fix, is not asserting cache, only responses
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver } = await helper.setup({ protocol, awsClient })

  const wantList = new WantList([new Entry(cid1, 1, false, Entry.WantType.Block, true)], false)

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const [response1] = await helper.receiveMessages(receiver, protocol)

  t.equal(response1.blocks.length, 1)
  t.equal(response1.blockPresences.length, 0)

  await connection.send(request.encode(protocol))
  const [response2] = await helper.receiveMessages(receiver, protocol)

  t.equal(response2.blocks.length, 1)
  t.equal(response2.blockPresences.length, 0)

  await helper.teardown(client, service, connection)

  helper.hasRawBlock(t, response1, cid1Content, 1)
  helper.hasRawBlock(t, response1, cid1Content, 1)
})

t.test('service - handles connection error', async t => {
  const { awsClient } = await mockAWS(config)
  const { client, service, connection, receiver, logger } = await helper.setup({ protocol, awsClient })

  connection.send(Buffer.from([0, 1, 2, 3]))

  await helper.receiveMessages(receiver, protocol)

  t.match(logger.messages.warn[0][0].err.message, 'index out of range: 4 + 3 > 4')
  t.equal(logger.messages.warn[0][1], 'Cannot decode received data')

  await helper.teardown(client, service, connection)
})

t.test('service - handles blocks error', async t => {
  const { awsClient, s3 } = await mockAWS(config)
  awsClient.agent = createMockAgent()
  awsClient.agent
    .get(awsClient.s3Url(s3.region, s3.bucket))
    .intercept({ path: '/' })
    .replyWithError(new Error('FAILED'))
  const { client, service, connection, receiver } = await helper.setup({ protocol, awsClient })

  const wantList = new WantList([new Entry(cid2, 1, false, Entry.WantType.Block, true)], false)

  const request = new Message(wantList, [], [], 0)
  await connection.send(request.encode(protocol))

  const responses = await helper.receiveMessages(receiver, protocol)
  await helper.teardown(client, service, connection)

  t.equal(responses.length, 0)
})

t.test('service - should use tagged peers', async t => {
  const { awsClient } = await mockAWS(config)
  const peerId = await createEd25519PeerId()
  const port = await getPort()
  const logger = helper.spyLogger()
  const taggedPeers = [
    {
      name: 'peer#1',
      peer: (await createEd25519PeerId()).toString()
    },
    {
      name: 'peer#2',
      peer: (await createEd25519PeerId()).toString()
    },
    {
      name: 'peer#3',
      peer: (await createEd25519PeerId()).toString()
    }
  ]

  const { service } = await startService({
    logger,
    awsClient,
    port,
    peerId,
    connectionConfig: createConnectionConfig(config),
    taggedPeers
  })

  t.equal(logger.messages.error.length, 0)

  for (let i = 0; i < taggedPeers.length; i++) {
    t.same(logger.messages.info[i][0].name, taggedPeers[i].name)
    t.same(logger.messages.info[i][0].peerId, taggedPeers[i].peer)
    t.equal(logger.messages.info[i][1], 'service add tagPeer to peerStore')
  }

  service.stop()
})

t.test('service - should throw on invalid tagged peers', async t => {
  const { awsClient } = await mockAWS(config)
  const peerId = await createEd25519PeerId()
  const port = await getPort()
  const logger = helper.spyLogger()

  await t.rejects(() => startService({
    logger,
    awsClient,
    port,
    peerId,
    connectionConfig: createConnectionConfig(config),
    taggedPeers: {}
  }), { message: 'SERVICE_INVALID_TAGGED_PEERS' })

  t.equal(logger.messages.error.length, 2)
  t.same(logger.messages.error[0][0].taggedPeers, {})
  t.equal(logger.messages.error[0][1], 'invalid taggedPeers for libp2p')
})

t.test('service - should throw on any invalid tagged peers', async t => {
  const { awsClient } = await mockAWS(config)
  const peerId = await createEd25519PeerId()
  const port = await getPort()
  const logger = helper.spyLogger()
  const taggedPeers = [
    {
      name: 'valid-peer-id',
      peer: '12D3KooWKBRcG1YF58DdbEkcmXi2gEPJL3hCD83Jz1VVYhB9Dajc'
    },
    {
      name: 'invalid-peer-id',
      peer: '123'
    },
    {
      name: 'invalid-peer-id-type',
      peer: -1
    },
    {
      name: 'invalid-missing-peer-id'
    },
    {
      // missing name
      peer: '12D3KooWKBRcG1YF58DdbEkcmXi2gEPJL3hCD83Jz1VVYhB9Dajc'
    },
    {} // empty
  ]

  await t.rejects(() => startService({
    logger,
    awsClient,
    port,
    peerId,
    connectionConfig: createConnectionConfig(config),
    taggedPeers
  }), { message: 'SERVICE_INVALID_TAGGED_PEERS' })

  t.equal(logger.messages.info.length, 0)
  t.equal(logger.messages.error.length, 6)

  t.same(logger.messages.error[0][0].taggedPeer, { name: 'invalid-peer-id', peer: '123' })
  t.match(logger.messages.error[0][0].err.message, 'Could not decode varint')
  t.equal(logger.messages.error[0][1], 'invalid taggedPeer, unable to create peer for taggedPeer')

  t.same(logger.messages.error[1][0].taggedPeer, { name: 'invalid-peer-id-type', peer: -1 })
  t.match(logger.messages.error[1][0].err.message, 'Non-base58btc character')
  t.equal(logger.messages.error[1][1], 'invalid taggedPeer, unable to create peer for taggedPeer')

  t.same(logger.messages.error[2][0].taggedPeer, { name: 'invalid-missing-peer-id' })
  t.equal(logger.messages.error[2][0].err, undefined)
  t.equal(logger.messages.error[2][1], 'invalid taggedPeer, missing peer name or value')

  t.same(logger.messages.error[3][0].taggedPeer, { peer: '12D3KooWKBRcG1YF58DdbEkcmXi2gEPJL3hCD83Jz1VVYhB9Dajc' })
  t.equal(logger.messages.error[3][0].err, undefined)
  t.equal(logger.messages.error[3][1], 'invalid taggedPeer, missing peer name or value')

  t.same(logger.messages.error[4][0].taggedPeer, { })
  t.equal(logger.messages.error[4][0].err, undefined)
  t.equal(logger.messages.error[4][1], 'invalid taggedPeer, missing peer name or value')
})
