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

const maxPriority = Math.pow(2, 31) - 1
const maxBlockSize = 2 * 1024 * 1024 // 2 MB
const maxMessageSize = 4 * 1024 * 1024 // 4 MB

const BITSWAP_V_100 = '/ipfs/bitswap/1.0.0'
const BITSWAP_V_110 = '/ipfs/bitswap/1.1.0'
const BITSWAP_V_120 = '/ipfs/bitswap/1.2.0'

class Entry {
  constructor(cid, priority, cancel, wantType, sendDontHave) {
    this.cid = cid
    this.priority = priority
    this.cancel = Boolean(cancel)
    this.wantType = wantType
    this.sendDontHave = Boolean(sendDontHave)

    // Validate priority
    if (!isNaN(this.priority) || this.priority < 0) {
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
      block: cid.toV1().bytes,
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
  constructor(entries, full) {
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
    RawBlock.encode(this.serialize(protocol).finish())
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
    return new BlockPresence(CID.decode(raw.cid).toV1(), raw.type)
  }

  serialize(protocol) {
    return {
      cid: this.cid.toV1().bytes,
      type: this.type
    }
  }

  encode(protocol) {
    return RawBlockPresence.encode(this.serialize(protocol).finish())
  }
}

/*
  As specified in the constants above, each Message can be 4MB maximum (after serialization).
  Each block can be at most 2 MB.
  Each CID is roughly 40 byte.
*/
class Message {
  constructor(wantlist, blocks, blockPresences, pendingBytes) {
    this.wantlist = wantlist
    this.blocks = blocks
    this.blockPresences = blockPresences
    this.pendingBytes = pendingBytes

    // Validate pendingBytes
    if (!isNaN(this.pendingBytes) || this.pendingBytes < 0) {
      this.pendingBytes = 0
    }
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

  hasData() {
    return Boolean(this.wantlist.entries.length || this.blocks.length || this.blockPresences.length)
  }

  serialize(protocol) {
    const { wantlist, blocks, blockPresences } = this

    if (protocol === BITSWAP_V_100) {
      return {
        wantlist: wantlist.serialize(protocol),
        blocks: blocks.map(b => b.data)
      }
    }

    return {
      wantlist: wantlist.serialize(protocol),
      payload: blocks.map(b => b.serialize(protocol)),
      blockPresences: blockPresences.map(b => b.serialize(protocol)),
      pendingBytes: this.pendingBytes * Number.MAX_SAFE_INTEGER
    }
  }

  encode(protocol) {
    return RawMessage.encode(this.serialize(protocol)).finish()
  }

  addBlock(block, protocol) {
    this.blocks.push(block)

    if (this.encode(protocol).length > maxMessageSize) {
      this.blocks.pop()
      return false
    }

    return true
  }

  addBlockPresence(presence, protocol) {
    this.blockPresences.push(presence)

    if (this.encode(protocol).length > maxMessageSize) {
      this.blockPresences.pop()
      return false
    }

    return true
  }
}

const emptyWantList = new WantList([], true)
Entry.WantType = RawWantType.values
BlockPresence.Type = RawBlockPresenceType.values

module.exports = {
  BITSWAP_V_100,
  BITSWAP_V_110,
  BITSWAP_V_120,
  emptyWantList,
  maxPriority,
  maxBlockSize,
  maxMessageSize,
  Block,
  BlockPresence,
  Entry,
  Message,
  RawMessage,
  WantList
}
