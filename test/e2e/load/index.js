'use strict'

const cases = require('./cases')
const path = require('path')
const autocannon = require('autocannon')
const config = require('../../../src/config')
const peerProxy = require('../shared/peer-proxy')
const targets = require('../shared/targets')

// TODO doc

const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const ONLY = process.env.ONLY

async function test() {
  const service = await peerProxy.startProxy({
    config,
    target: targets[TARGET_ENV],
    startPeer: TARGET_ENV === 'local',
    concurrency: 4
  })

  const c = await cases.loadTestCases({
    dir: path.join(__dirname, './snaps/'),
    request: service.request,
    only: ONLY
  })

  // run concurrent requests
  // match them with snap
  let done = 0
  for (const case_ of c.cases) {
    console.log(' *** running', case_.file, case_.test, '...')
    autocannon({
      url: service.url,
      requests: [case_],
      duration: case_.test.duration,
      connections: case_.test.connections,
      timeout: case_.test.timeout
    }, (error, result) => {
      console.log(' *** done', case_.file, case_.count)
      if (error) { console.error({ error }) }

      // console.log({ result })
      console.log(autocannon.printResult(result))

      if (++done === c.cases.length) {
        service.close()
      }
    })
  }
}

test()
