'use strict'

const fs = require('fs/promises')
const path = require('path')
const assert = require('assert')

function noop() { }
// TODO use process.stodout
function print(...args) { console.log(...args) }

async function loadCases({ dir, request, only, updateSnaps = false, verbose = false }) {
  const requests = { cases: [], counter: {} }
  const out = {}
  const errors = {}
  const files = await fs.readdir(dir)
  const verbosity = verbose ? print : noop

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
      const response = JSON.stringify(c.response)

      const case_ = {
        ...request,
        test: c.test,
        file,
        count: 0,
        body: JSON.stringify(c.request),
        onResponse: (status, body, context) => {
          case_.count++

          verbosity('response', body)

          if (!out[filePath]) {
            out[filePath] = true
            if (updateSnaps) {
              verbosity('update snap', filePath)
              c.response = JSON.parse(body)
              fs.writeFile(filePath, JSON.stringify(c, null, 2), 'utf8')
            }
          }

          if (updateSnaps) { return }

          try {
            verbosity('assert', body, filePath)

            // exact match
            if (body === response) { return }
          } catch (err) { }

          if (errors[filePath]) {
            return
          }

          try {
            assert.deepStrictEqual(JSON.parse(body), c.response)
          } catch (err) {
            errors[filePath] = true
            console.error('\n\n !!! MATCH FAILED', filePath)
            console.error(err)
          }
        }
      }
      requests.cases.push(case_)
    } catch (err) {
      console.error('error loading', filePath)
    }
  }
  return requests
}

module.exports = {
  loadCases
}
