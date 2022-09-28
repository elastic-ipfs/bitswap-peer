'use strict'

const path = require('path')
const autocannon = require('autocannon')

const helper = require('./helper')
const regression = require('./helper/regression')
const config = require('../../src/config')

// TODO doc

const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const UPDATE_SNAPS = !!process.env.UPDATE_SNAPS
const ONLY = process.env.ONLY
const VERBOSE = !!process.env.VERBOSE
const TRACK_FILE = path.join(__dirname, './track', 'regression.json')

async function test() {
  const tracker = helper.trackResources()

  const service = await helper.startProxy({
    config,
    target: helper.targets[TARGET_ENV],
    startPeer: TARGET_ENV === 'local',
    concurrency: 4
  })

  const c = await regression.loadCases({
    dir: path.join(__dirname, './snaps/regression'),
    request: service.request,
    updateSnaps: UPDATE_SNAPS,
    only: ONLY,
    verbose: VERBOSE
  })

  // run concurrent requests
  // match them with snap
  const start = Date.now()
  let done = 0
  for (const case_ of c.cases) {
    console.log(' *** running', case_.file, case_.test, '...')
    autocannon({
      url: service.url,
      requests: [case_],
      duration: case_.test.duration ?? 1,
      amount: case_.test.amount,
      connections: case_.test.connections,
      timeout: case_.test.timeout
    }, (error, result) => {
      console.log(' *** done', case_.file, case_.count)
      if (error) { console.error({ error }) }

      // console.log({ result })
      console.log(autocannon.printResult(result))

      if (++done === c.cases.length) {
        end({ start, service, tracker })
      }
    })
  }
}

async function end({ start, service, tracker }) {
  console.log('done in ', Date.now() - start, 'ms')
  await tracker.write(TRACK_FILE)
  service.close()
}

test()
