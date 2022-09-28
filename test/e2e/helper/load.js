'use strict'

const fs = require('fs/promises')
const path = require('path')

async function loadCases({ dir, only }) {
  const files = await fs.readdir(dir)

  const requests = []
  for (const file of files) {
    if (only) {
      if (file !== only) {
        console.info(' *** skip', file)
        continue
      }
    }
    const filePath = path.join(dir, file)
    try {
      requests.push({
        body: await fs.readFile(filePath, 'utf8')
      })
    } catch (err) {
      console.error('error loading', filePath)
    }
  }
  return requests
}

module.exports = {
  loadCases
}
