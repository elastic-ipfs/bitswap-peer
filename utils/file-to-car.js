#!/usr/bin/env node

import { packToFs } from 'ipfs-car/pack/fs'
import { FsBlockStore } from 'ipfs-car/blockstore/fs'

packToFs({
  input: process.argv[2],
  output: process.argv[3],
  blockstore: new FsBlockStore(),
  maxChunkSize: process.argv.length > 3 ? parseInt(process.argv[4], 10) : undefined
})
