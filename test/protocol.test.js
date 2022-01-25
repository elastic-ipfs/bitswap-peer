'use strict'

const t = require('tap')
const {
  maxMessageSize,
  Block,
  BlockPresence,
  Entry,
  Message,
  WantList,
  BITSWAP_V_120,
  maxPriority
} = require('../src/protocol')
const { cid3 } = require('./utils/helpers')

t.test('protocol - safety checks', t => {
  t.plan(7)

  const message = new Message(new WantList([], true), [], [], -1)
  t.notOk(message.hasData())

  message.wantlist.entries.push(new Entry())
  t.ok(message.hasData())

  t.ok(message.addBlockPresence(new BlockPresence({ byteLength: 10 }, BlockPresence.Type.Have)))
  t.ok(message.hasData())

  t.ok(message.addBlock(new Block(cid3, Buffer.alloc(maxMessageSize * 0.89))))
  t.ok(message.hasData())

  t.notOk(message.addBlockPresence(new BlockPresence({ byteLength: 100000 }, BlockPresence.Type.Have)))
})

t.test('protocol - Protocol Buffers messages are properly sanitized and encoded', t => {
  t.plan(5)

  t.equal(new Block(cid3, Buffer.alloc(10)).encode(BITSWAP_V_120).toString('base64'), 'CgQBcBIgEgoAAAAAAAAAAAAA')

  t.equal(
    new BlockPresence(cid3, 100).encode(BITSWAP_V_120).toString('base64'),
    'CiQBcBIgQiiWoc6Cp7HMC6J8fY3iiGx9+VWIRz1eiKKKn8+g5D4QAA=='
  )

  t.equal(
    new Entry(cid3, -1, true, Entry.WantType.Have, true).encode(BITSWAP_V_120).toString('base64'),
    'CiQBcBIgQiiWoc6Cp7HMC6J8fY3iiGx9+VWIRz1eiKKKn8+g5D4QARgBIAEoAQ=='
  )

  t.equal(
    new Entry(cid3, maxPriority + 1, true, Entry.WantType.Have, true).encode(BITSWAP_V_120).toString('base64'),
    'CiQBcBIgQiiWoc6Cp7HMC6J8fY3iiGx9+VWIRz1eiKKKn8+g5D4Q/////wcYASABKAE='
  )

  t.equal(new WantList([], true).encode(BITSWAP_V_120).toString('base64'), 'EAE=')
})
