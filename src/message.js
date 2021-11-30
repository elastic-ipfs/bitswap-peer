'use strict'

const { CID } = require('multiformats/cid')
const { loadSync } = require('protobufjs')
const { resolve } = require('path')

const maxPriority = Math.pow(2, 31) - 1

const definitions = loadSync(resolve(process.cwd(), 'bitswap.proto'))
const RawWantlist = definitions.lookupType('Message.Wantlist')
const RawWantType = definitions.lookupEnum('Message.WantType')
const RawEntry = definitions.lookupType('Message.Entry')
const RawBlock = definitions.lookupType('Message.Block')
const RawBlockPresenceType = definitions.lookupEnum('Message.BlockPresenceType')
const RawBlockPresence = definitions.lookupType('Message.BlockPresence')
const RawMessage = definitions.lookupType('Message')

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

  static fromRaw(raw, version) {
    let wantType = raw.wantType
    let sendDontHave = raw.sendDontHave
    let cid = CID.decode(raw.block)

    if (version === BITSWAP_V_100) {
      cid = cid.toV0()
      wantType = RawWantType.Block
      sendDontHave = false
    }

    return new Entry(cid, raw.priority, raw.cancel, wantType, sendDontHave)
  }

  serialize(version) {
    const { cid, priority, cancel, wantType, sendDontHave } = this

    if (version === BITSWAP_V_100 || version === BITSWAP_V_110) {
      return {
        block: (version === BITSWAP_V_100 && cid.version === 1 ? CID.createV0(cid.multihash) : cid).bytes,
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

  encode(version) {
    return RawEntry.encode(this.serialize(version)).finish()
  }
}

class WantList {
  constructor(entries, full) {
    this.entries = entries
    this.full = Boolean(full)
  }

  static fromRaw(raw, version) {
    return new WantList(
      raw.entries.map(e => Entry.fromRaw(e, version)),
      raw.full
    )
  }

  serialize(version) {
    return {
      entries: this.entries.map(e => e.serialize(version)),
      full: this.full
    }
  }

  encode(version) {
    return RawWantlist.encode(this.serialize(version)).finish()
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

  static fromRaw(raw, version) {
    if (version === BITSWAP_V_100) {
      return new Block(null, raw)
    }

    return new Block(raw.prefix, raw.data)
  }

  serialize(version) {
    return {
      prefix: this.prefix,
      data: this.data
    }
  }

  encode(version) {
    RawBlock.encode(this.serialize(version).finish())
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

  static fromRaw(raw, version) {
    return new BlockPresence(CID.decode(raw.cid).toV1(), raw.type)
  }

  serialize(version) {
    return {
      cid: this.cid.toV1().bytes,
      type: this.type
    }
  }

  encode(version) {
    return RawBlockPresence.encode(this.serialize(version).finish())
  }
}

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

  static decode(encoded, version) {
    const decoded = RawMessage.decode(encoded)

    if (version === BITSWAP_V_100) {
      return new Message(
        WantList.fromRaw(decoded.wantlist, version),
        decoded.blocks.map(b => Block.fromRaw(b, version)),
        [],
        0
      )
    }

    return new Message(
      WantList.fromRaw(decoded.wantlist, version),
      decoded.payload.map(b => Block.fromRaw(b, version)),
      decoded.blockPresences.map(b => BlockPresence.fromRaw(b, version)),
      decoded.pendingBytes
    )
  }

  hasData() {
    return Boolean(this.wantlist.entries.length || this.blocks.length || this.blockPresences.length)
  }

  serialize(version) {
    const { wantlist, blocks, blockPresences } = this

    if (version === BITSWAP_V_100) {
      return {
        wantlist: wantlist.serialize(version),
        blocks: blocks.map(b => b.data)
      }
    }

    return {
      wantlist: wantlist.serialize(version),
      payload: blocks.map(b => b.serialize(version)),
      blockPresences: blockPresences.map(b => b.serialize(version)),
      pendingBytes: this.pendingBytes
    }
  }

  encode(version) {
    return RawMessage.encode(this.serialize(version)).finish()
  }
}

Entry.WantType = RawWantType.values
BlockPresence.Type = RawBlockPresenceType.values

module.exports = {
  BITSWAP_V_100,
  BITSWAP_V_110,
  BITSWAP_V_120,
  Entry,
  WantList,
  Block,
  BlockPresence,
  Message,
  RawMessage
}
