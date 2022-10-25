
import t from 'tap'
import { cid3 } from './fixtures/cids.js'
import {
  BITSWAP_V_120,
  Block,
  BlockPresence,
  Entry,
  maxPriority,
  WantList
} from '../src/protocol.js'

t.test('protocol - Protocol Buffers messages are properly sanitized and encoded', async t => {
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
