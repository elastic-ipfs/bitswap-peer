'use strict'

const { base32 } = require('multiformats/bases/base32')
const { createFromBytes } = require('peer-id')
const { CID } = require('multiformats/cid')

const [rawCid, rawPeerId] = process.argv[2].split('/').slice(2)
const cid = CID.parse(`B${rawCid}`.toLowerCase(), base32.decoder)
const peerId = createFromBytes(base32.decode(`B${rawPeerId}`.toLowerCase()))

console.log(`Key: ${process.argv[2]}`)
console.log('------------------------------------------------------')
console.log(`CID (v0): ${cid.toV0()}`)
console.log(`CID (v1): ${cid.toV1()}`)
console.log('------------------------------------------------------')
console.log(`PeerID (base32): ${peerId.toString()}`)
console.log(`PeerID (base58): ${peerId.toB58String()}`)
