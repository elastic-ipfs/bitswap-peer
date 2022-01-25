'use strict'

const { CarWriter } = require('@ipld/car')
const dagPB = require('@ipld/dag-pb')
const { randomBytes } = require('crypto')
const { createWriteStream } = require('fs')
const { CID } = require('multiformats/cid')
const { code: rawCode } = require('multiformats/codecs/raw')
const { sha256 } = require('multiformats/hashes/sha2')
const { Readable } = require('stream')
const { cid1Content, cid2Link } = require('../test/utils')

const { maxBlockSize } = require('../src/protocol')

/*
  Keep this configuration up-to-date with cids definition in test/utils.js.

  - If the value is 'raw', then a raw block with contents equal to cid1Content will be generated.
  - If the value is a positive number, then a raw block with contents of a specific size will be generated.
  - If the value is 'dag-pb', then a DAG-PB block with a link to cid2Link will be generated.
  - If the value is 'sep', then a separator is printed on the output
*/
const configuration = {
  cid1: 'raw',
  cid2: 'dag-pb',
  sep1: 'sep',
  cid5: 1500000,
  cid6: 1500000,
  cid7: 1500000,
  cid8: 3000000,
  sep2: 'sep',
  cid9: maxBlockSize - 500
}

async function createCAR(path, configuration) {
  let content
  const code = configuration === 'dag-pb' ? dagPB.code : rawCode

  switch (configuration) {
    case 'raw':
      content = new TextEncoder().encode(cid1Content)
      break
    case 'dag-pb':
      {
        const hash = await sha256.digest(randomBytes(10))

        content = dagPB.encode({
          Data: new TextEncoder().encode(cid1Content),
          Links: [{ Hash: CID.create(1, code, hash), Name: cid2Link }]
        })
      }
      break
    default:
      content = randomBytes(configuration)
      break
  }

  const hash = await sha256.digest(content)
  const cid = CID.create(1, code, hash)
  const { writer, out } = await CarWriter.create([cid])

  Readable.from(out).pipe(createWriteStream(path))
  await writer.put({ cid, bytes: content })
  await writer.close()

  return [cid, path]
}

async function main() {
  const prefix = process.argv[2] || 'test'
  const bucket = process.argv[3] || 'test'

  // Generate
  const generated = await Promise.all(
    Object.entries(configuration).map(async ([id, configuration]) => {
      if (configuration === 'sep') {
        return Promise.resolve(null)
      }

      return [id, ...(await createCAR(`${prefix}-${id}.car`, configuration))]
    })
  )

  console.log('--- Generation terminated ---')
  for (const generation of generated) {
    if (generation) {
      console.log(`${generation[0]}: ${generation[1]} / ${generation[2]}`)
    } else {
      console.log('-----------------------------')
    }
  }
  console.log('-----------------------------')

  if (process.argv[3] === 'true') {
    // Generate the event.json for the indexer
    console.log('\n--- Indexer event.json ---')
    console.log(
      JSON.stringify(
        {
          Records: generated.filter(g => g).map(g => ({ s3: { bucket: { name: bucket }, object: { key: g[2] } } }))
        },
        null,
        2
      )
    )
  }
}

main()
