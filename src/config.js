'use strict'

require('dotenv').config()
const PeerId = require('peer-id')
const { readFile } = require('fs/promises')
const { resolve } = require('path')

const {
  PEER_ID_JSON: peerIdJsonPath,
  PORT: rawPort,
  DYNAMO_BLOCKS_TABLE: blocksTable,
  DYNAMO_CARS_TABLE: carsTable
} = process.env

async function getPeerId() {
  try {
    const peerIdJson = JSON.parse(await readFile(resolve(process.cwd(), peerIdJsonPath), 'utf-8'))
    return await PeerId.createFromJSON(peerIdJson)
  } catch (e) {
    return PeerId.create()
  }
}

const port = parseInt(rawPort)

module.exports = {
  getPeerId,
  port: !isNaN(port) && port > 0 ? port : 0,
  blocksTable: blocksTable ?? 'blocks',
  carsTable: carsTable ?? 'cars',
  primaryKeys: {
    blocks: 'multihash',
    cars: 'path'
  }
}
