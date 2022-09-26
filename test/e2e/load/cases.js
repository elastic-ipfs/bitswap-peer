const fs = require('fs/promises')
const path = require('path')

async function loadTestCases({ dir, request, only }) {
  const requests = { cases: [], counter: {} }
  const files = await fs.readdir(dir)

  for (const file of files) {
    if (only) {
      if (file !== only) {
        console.info(' *** skip', file)
        continue
      }
    }
    const filePath = path.join(dir, file)
    try {
      const c = require(filePath)

      const case_ = {
        ...request,
        test: c.test,
        file,
        count: 0,
        body: JSON.stringify(c.request)
      }
      requests.cases.push(case_)
    } catch (err) {
      console.error('error loading', filePath)
    }
  }
  return requests
}

module.exports = {
  loadTestCases
}
