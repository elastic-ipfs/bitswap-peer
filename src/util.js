'use strict'

const { base58btc: base58 } = require('multiformats/bases/base58')

function cidToKey(cid) {
  return base58.encode(cid.multihash.bytes)
}

/**
 * @param {{ car: string, offset: number, length: number }} - blockInfo
 */
function sizeofBlockInfo(blockInfo) {
  return blockInfo?.car?.length ? blockInfo.car.length * 2 + 16 : 0
}

module.exports = { cidToKey, sizeofBlockInfo }
