'use strict'

const PeerId = require('peer-id')

async function main() {
  const peerId = await PeerId.create()
  console.log(JSON.stringify({ peerId: peerId.toString(), ...peerId.toJSON() }, null, 2))
}

main().catch(console.error)
