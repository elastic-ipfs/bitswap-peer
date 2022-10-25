
import t from 'tap'

import config from '../src/config.js'
import { BITSWAP_V_100 as protocol, Entry, Message, WantList } from '../src/protocol.js'
import { cid1, cid1Content, cid2 } from './fixtures/cids.js'
import * as helper from './utils/helper.js'
import { mockAWS, createMockAgent } from './utils/mock.js'

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

  t.match(logger.messages.warn[0][0].err, '[RangeError] index out of range: 4 + 3 > 4\nRangeError: index out of range: 4 + 3 > 4\n')
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
