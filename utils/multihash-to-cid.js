#!/usr/bin/env node

import { base58btc as base58 } from 'multiformats/bases/base58'
import { CID } from 'multiformats/cid'
import { decode as digestDecode } from 'multiformats/hashes/digest'

const digest = digestDecode(base58.decode(process.argv[2]))
const codec = parseInt(process.argv[3])
console.log(`Multihash HEX digest: ${Buffer.from(digest.digest).toString('hex')}`)
console.log(`CID (v1): ${CID.create(1, codec, digest).toString()}`)
