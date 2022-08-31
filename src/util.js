'use strict'

const { base58btc: base58 } = require('multiformats/bases/base58')

function cidToKey(cid) {
  return base58.encode(cid.multihash.bytes)
}

// block is { car: string, offset: number, length: number }
function sizeofBlockInfo(blockInfo) {
  return blockInfo.car.length * 2 + 16
}

module.exports = { cidToKey, sizeofBlockInfo }
