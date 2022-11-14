
import fs from 'fs'
import path from 'path'
import url from 'url'
import { base58btc as base58 } from 'multiformats/bases/base58'

function cidToKey (cid) {
  try {
    return base58.encode(cid.multihash.bytes)
  } catch (error) {
    return false
  }
}

/**
 * @param {{ car: string, offset: number, length: number }} - blockInfo
 */
function sizeofBlockInfo (blockInfo) {
  return blockInfo?.car?.length ? blockInfo.car.length * 2 + 16 : 0
}

function sleep (ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

function dirname (importMetaUrl) {
  return path.dirname(url.fileURLToPath(importMetaUrl))
}

const packageJson = JSON.parse(fs.readFileSync(path.join(dirname(import.meta.url), '../package.json'), 'utf8'))
const version = packageJson.version

export { cidToKey, sizeofBlockInfo, sleep, dirname, version }
