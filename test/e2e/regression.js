'use strict'

const helper = require('./helper')
const path = require('path')
const autocannon = require('autocannon')

const config = require('../../src/config')

// TODO doc

const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const UPDATE_SNAPS = !!process.env.UPDATE_SNAPS
const ONLY = process.env.ONLY
const VERBOSE = !!process.env.VERBOSE

const targets = {
  local: '/ip4/127.0.0.1/tcp/3000/ws/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei',
  prod: '/dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm',
  staging: '/dns4/elastic-staging.dag.house/tcp/443/wss/p2p/bafzbeigjqot6fm3i3yv37wiyybsfblrlsmib7bzlbnkpjxde6fw6b4fvei',
  dev: '/dns4/elastic-dev.dag.house/tcp/443/wss/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei'
}

async function test() {
  const service = await helper.startProxy({
    config,
    target: targets[TARGET_ENV],
    startPeer: true,
    concurrency: 4
  })

  const c = await helper.loadRegressionCases({
    dir: path.join(__dirname, './snaps/regression'),
    request: service.request,
    updateSnaps: UPDATE_SNAPS,
    only: ONLY,
    verbose: VERBOSE
  })

  // run concurrent requests
  // match them with snap
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
        service.close()
      }
    })
  }
}

test()
