'use strict'

const { CID } = require('multiformats/cid')
const { loadSync } = require('protobufjs')
const { join } = require('path')

const definitions = loadSync(join(__dirname, '../bitswap.proto'))
const RawWantlist = definitions.lookupType('Message.Wantlist')
const RawWantType = definitions.lookupEnum('Message.WantType')
const RawEntry = definitions.lookupType('Message.Entry')
const RawBlock = definitions.lookupType('Message.Block')
const RawBlockPresenceType = definitions.lookupEnum('Message.BlockPresenceType')
const RawBlockPresence = definitions.lookupType('Message.BlockPresence')
const RawMessage = definitions.lookupType('Message')

const { logger, serializeError } = require('../src/logging')

const maxPriority = Math.pow(2, 31) - 1

const BITSWAP_V_100 = '/ipfs/bitswap/1.0.0'
const BITSWAP_V_110 = '/ipfs/bitswap/1.1.0'
const BITSWAP_V_120 = '/ipfs/bitswap/1.2.0'
const protocols = [BITSWAP_V_120, BITSWAP_V_110, BITSWAP_V_100]

const BLOCK_TYPE_INFO = 1
const BLOCK_TYPE_DATA = 2

/*
  Breakdown of the constants below:

  - nonEmptyOverhead is the overhead added to the message when either block and blockPresence are non empty
    - 2 is the size of the varint used to declare the new embedded messages
    - 8 (4 x 2) is the size of the  varint used to declare embedded messages payload when the total message size is 4 MB
  - newBlockOverhead is the fixed overhead added by a new block (without considering the data field size)
    - 1 is the size of the varint which declares the new embedded message
    - 1 is the size of the varint which declares the prefix field
    - 4 is the size of the varint used to declare the data field message payload when the total message size is 4 MB
    - 4 is the size of the CI prefix
  - newPresenceSize is the fixed overhead added by a new presence (without considering the cid field size)
    - 1 is the varint which declare the new embedded message
    - 1 is the varint which declare the cid field
    - 1 is the varint which declare the type field
    - 1 is the varint of the type field value
  Note that for safety we are only considering BitSwap 1.2.0 since its overhead is the biggest.
*/
const nonEmptyOverhead = 2 + 8
const newBlockOverhead = 1 + 1 + 4 + 4
const newPresenceOverhead = 1 + 1 + 1 + 1

const EMPTY_MESSAGE_OVERHEAD_SIZE = 16 // 16 = Message.encode(BITSWAP_V_120).length + nonEmptyOverhead on empty message

class Entry {
  constructor(cid, priority, cancel, wantType, sendDontHave) {
    this.cid = cid
    // TODO implement priority?
    this.priority = priority
    this.cancel = Boolean(cancel)
    this.wantType = wantType
    this.sendDontHave = Boolean(sendDontHave)

    this.key = null
    this.type = BLOCK_TYPE_INFO
    this.data = null
    this.info = null

    // Validate priority
    if (isNaN(this.priority) || this.priority < 0) {
      this.priority = 1
    } else if (this.priority > maxPriority) {
      this.priority = maxPriority
    }

    // Validate wantType
    if (!RawWantType.valuesById[this.wantType]) {
      this.wantType = 0
    }
  }

  static fromRaw(raw, protocol) {
    let wantType = raw.wantType
    let sendDontHave = raw.sendDontHave
    let cid = CID.decode(raw.block)

    if (protocol === BITSWAP_V_100) {
      cid = cid.toV0()
      wantType = RawWantType.Block
      sendDontHave = false
    }

    return new Entry(cid, raw.priority, raw.cancel, wantType, sendDontHave)
  }

  serialize(protocol) {
    const { cid, priority, cancel, wantType, sendDontHave } = this

    if (protocol === BITSWAP_V_100 || protocol === BITSWAP_V_110) {
      return {
        block: (protocol === BITSWAP_V_100 && cid.version === 1 ? CID.createV0(cid.multihash) : cid).bytes,
        priority,
        cancel
      }
    }

    return {
      block: cid.bytes,
      priority,
      cancel,
      wantType,
      sendDontHave
    }
  }

  encode(protocol) {
    return RawEntry.encode(this.serialize(protocol)).finish()
  }
}

class WantList {
  constructor(entries, full = false) {
    this.entries = entries
    this.full = Boolean(full)
  }

  static fromRaw(raw, protocol) {
    return new WantList(
      raw.entries.map(e => Entry.fromRaw(e, protocol)),
      raw.full
    )
  }

  serialize(protocol) {
    return {
      entries: this.entries.map(e => e.serialize(protocol)),
      full: this.full
    }
  }

  encode(protocol) {
    return RawWantlist.encode(this.serialize(protocol)).finish()
  }
}

class Block {
  constructor(prefixOrCid, data) {
    if (prefixOrCid instanceof CID) {
      prefixOrCid = Buffer.from([
        prefixOrCid.version,
        prefixOrCid.code,
        prefixOrCid.multihash.bytes[0],
        prefixOrCid.multihash.bytes[1]
      ])
    }

    this.prefix = prefixOrCid
    this.data = data
  }

  static fromRaw(raw, protocol) {
    if (protocol === BITSWAP_V_100) {
      return new Block(null, raw)
    }

    return new Block(raw.prefix, raw.data)
  }

  serialize(protocol) {
    return {
      prefix: this.prefix,
      data: this.data
    }
  }

  encode(protocol) {
    return RawBlock.encode(this.serialize(protocol)).finish()
  }
}

class BlockPresence {
  constructor(cid, type) {
    this.cid = cid
    this.type = type

    // Validate type
    if (!RawBlockPresenceType.valuesById[this.type]) {
      this.type = 0
    }
  }

  static fromRaw(raw, protocol) {
    return new BlockPresence(CID.decode(raw.cid), raw.type)
  }

  serialize(protocol) {
    return {
      cid: this.cid.bytes,
      type: this.type
    }
  }

  encode(protocol) {
    return RawBlockPresence.encode(this.serialize(protocol)).finish()
  }
}

const emptyWantList = new WantList([], true)

class Message {
  constructor(wantlist = emptyWantList, blocks = [], blockPresences = [], pendingBytes = 0) {
    this.wantlist = wantlist
    this.blocks = blocks
    this.blockPresences = blockPresences
    this.pendingBytes = pendingBytes
    this.blocksSize = this.isEmpty() ? EMPTY_MESSAGE_OVERHEAD_SIZE : this.encode(BITSWAP_V_120).length + nonEmptyOverhead
  }

  isEmpty() {
    return this.wantlist.entries.length + this.blocks.length + this.blockPresences.length < 1
  }

  static decode(encoded, protocol) {
    const decoded = RawMessage.decode(encoded)

    if (protocol === BITSWAP_V_100) {
      return new Message(
        WantList.fromRaw(decoded.wantlist, protocol),
        decoded.blocks.map(b => Block.fromRaw(b, protocol)),
        [],
        0
      )
    }

    return new Message(
      WantList.fromRaw(decoded.wantlist, protocol),
      decoded.payload.map(b => Block.fromRaw(b, protocol)),
      decoded.blockPresences.map(b => BlockPresence.fromRaw(b, protocol)),
      decoded.pendingBytes
    )
  }

  serialize(protocol) {
    if (protocol === BITSWAP_V_100) {
      return {
        wantlist: this.wantlist.serialize(protocol),
        blocks: this.blocks.map(b => b.data)
      }
    }

    return {
      wantlist: this.wantlist.serialize(protocol),
      payload: this.blocks.map(b => b.serialize(protocol)),
      blockPresences: this.blockPresences.map(b => b.serialize(protocol)),
      pendingBytes: this.pendingBytes * Number.MAX_SAFE_INTEGER
    }
  }

  encode(protocol) {
    return RawMessage.encode(this.serialize(protocol)).finish()
  }

  /**
   * push block to message, to be sent later
   * note there are no size limit, because the purpose is to send responses asap **without buffering**
   */
  push(block, size, protocol) {
    if (block.cancel) { return false }

    const responseBlock = response[block.type](block, protocol)
    if (!responseBlock) { return }

    if (responseBlock.type === BLOCK_TYPE_DATA) {
      this.blocks.push(responseBlock.block)
      this.blocksSize += newBlockOverhead + size
    } else {
      this.blockPresences.push(responseBlock.block)
      this.blocksSize += newPresenceOverhead + size
    }
  }

  size() {
    return this.blocksSize
  }

  async send(context) {
    try {
      if (this.blocks.length > 0 || this.blockPresences.length > 0) {
        const encoded = this.encode(context.protocol)
        await context.connection.send(encoded)
      }
    } catch (error) {
      logger.error({ error: serializeError(error) }, 'error on Message.send')
    }
  }
}

const response = {
  [BLOCK_TYPE_DATA]: (block, protocol) => {
    if (block.data?.found) {
      return { type: BLOCK_TYPE_DATA, block: new Block(block.cid, block.data.content) }
    }
    if (block.data?.notFound && block.sendDontHave && protocol === BITSWAP_V_120) {
      return { type: BLOCK_TYPE_INFO, block: new BlockPresence(block.cid, BlockPresence.Type.DontHave) }
    }
  },
  [BLOCK_TYPE_INFO]: (block, protocol) => {
    if (block.info?.found) {
      return { type: BLOCK_TYPE_INFO, block: new BlockPresence(block.cid, BlockPresence.Type.Have) }
    }
    if (block.info?.notFound && block.sendDontHave && protocol === BITSWAP_V_120) {
      return { type: BLOCK_TYPE_INFO, block: new BlockPresence(block.cid, BlockPresence.Type.DontHave) }
    }
  }
}

Entry.WantType = RawWantType.values
BlockPresence.Type = RawBlockPresenceType.values

module.exports = {
  BITSWAP_V_100,
  BITSWAP_V_110,
  BITSWAP_V_120,
  Block,
  BlockPresence,
  emptyWantList,
  Entry,
  maxPriority,
  Message,
  newBlockOverhead,
  newPresenceOverhead,
  protocols,
  RawMessage,
  WantList,
  BLOCK_TYPE_INFO,
  BLOCK_TYPE_DATA
}
