#!/usr/bin/env node

import { CarWriter } from '@ipld/car'
import { createWriteStream } from 'fs'
import { CID } from 'multiformats/cid'
import { encode as encodeRaw, code } from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { Readable } from 'stream'

async function generate () {
  const content = Buffer.allocUnsafe(4 * 1024 * 1024).fill('\u2222')
  const hash = await sha256.digest(encodeRaw(content))
  const cid = CID.create(1, code, hash)
  const { writer, out } = await CarWriter.create([cid])

  Readable.from(out).pipe(createWriteStream(process.argv[2]))
  await writer.put({ cid, bytes: content })
  await writer.close()
}

generate()
