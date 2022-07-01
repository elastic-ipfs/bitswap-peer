'use strict'

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const storage = require('../src/storage')

async function query(blockKey) {
  await storage.ensureAwsCredentials()
  const items = await storage.searchCarInDynamoV1({ blockKey, logger: console })

  console.log(items)
}

query(process.env.BLOCK_KEY)
