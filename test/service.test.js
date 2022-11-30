
import t from 'tap'

import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import getPort from 'get-port'
import config from '../src/config.js'
import { BITSWAP_V_100 as protocol, Entry, Message, WantList } from 'e-ipfs-core-lib'
import { cid1, cid1Content, cid2 } from './fixtures/cids.js'
import * as helper from './utils/helper.js'
import { mockAWS, createMockAgent } from './utils/mock.js'
import { startService } from '../src/service.js'

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
      }
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
