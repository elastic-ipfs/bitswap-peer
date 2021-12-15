'use strict'

const { CarWriter } = require('@ipld/car')
const { createWriteStream } = require('fs')
const { CID } = require('multiformats/cid')
const { encode: encodeRaw, code } = require('multiformats/codecs/raw')
const { sha256 } = require('multiformats/hashes/sha2')
const { Readable } = require('stream')

const { maxBlockSize } = require('../src/protocol')

async function generate() {
  const content = Buffer.allocUnsafe(maxBlockSize - 500).fill('\u2222')
  const hash = await sha256.digest(encodeRaw(content))
  const cid = CID.create(1, code, hash)
  const { writer, out } = await CarWriter.create([cid])

  Readable.from(out).pipe(createWriteStream(process.argv[2]))
  await writer.put({ cid, bytes: content })
  await writer.close()
}

generate()
