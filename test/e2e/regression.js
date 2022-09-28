'use strict'

const helper = require('./helper')
const path = require('path')
const autocannon = require('autocannon')

const config = require('../../src/config')

// TODO doc

const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const UPDATE_SNAPS = !!process.env.UPDATE_SNAPS
const CONNECTIONS = process.env.CONNECTIONS ? parseInt(process.env.CONNECTIONS) : 10
const DURATION = process.env.DURATION ? parseInt(process.env.DURATION) : 5 // seconds
const AMOUNT = process.env.AMOUNT ? parseInt(process.env.AMOUNT) : undefined
const ONLY = process.env.ONLY
const VERBOSE = !!process.env.VERBOSE
const TIMEOUT = process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30

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
    startPeer: true
  })

  const c = await helper.loadRegressionCases({
    dir: path.join(__dirname, './snaps/regression'),
    request: service.request,
    updateSnaps: UPDATE_SNAPS,
    only: ONLY,
    verbose: VERBOSE
  })

  const amount = UPDATE_SNAPS ? c.cases.length : AMOUNT
  const connections = amount || CONNECTIONS
  const duration = DURATION

  // run concurrent requests
  // match them with snap
  // TODO run in parallel
  autocannon({
    url: service.url,
    duration,
    amount,
    connections,
    requests: c.cases,
    timeout: TIMEOUT
  }, (error, result) => {
    console.log(' *** DONE ***', c.counter)
    if (error) { console.error({ error }) }

    // console.log({ result })
    console.log(autocannon.printResult(result))

    service.close()
  })
}

test()
