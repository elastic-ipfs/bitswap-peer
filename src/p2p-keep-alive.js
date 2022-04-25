/*
This is a workaround for ERR_MPLEX_STREAM_RESET errors
This is related to:
https://github.com/libp2p/js-libp2p-mplex/issues/111
https://github.com/libp2p/js-libp2p-interfaces/pull/90
https://github.com/libp2p/js-libp2p-mplex/pull/121
This was written based on:
https://github.com/status-im/js-waku/issues/185
*/

// const { Ping } = require('libp2p/src/ping')
// const { mount, ping } = require('libp2p/src/ping')
const { libp2p } = require('libp2p')
const { logger, serializeError } = require('./logging')
const { pingPeriodSecs } = require('./config')

const pingKeepAliveTimers = {}

function startKeepAlive(peerId, currentNode) {
  // Just in case a timer already exist for this peer
  //TODO: Delete this, just for testing
  logger.info('** pingPeriodSecs = ' + pingPeriodSecs)

  stopKeepAlive(peerId)

  const peerIdStr = peerId.toB58String()

  //
  if (pingPeriodSecs !== 0) {
    // const pingService = new PingService(currentNode)
    // Ping.mount(currentNode) // Enable this peer to echo Ping requests
    logger.info('** started pingService = ' + pingPeriodSecs)
    pingKeepAliveTimers[peerIdStr] = setInterval(() => {
      logger.info('** Hit interval, time to ping!')
      // new Ping(currentNode, peerId).catch(error => {
      currentNode.ping(peerId).then(() => logger.info("pong")).catch(error => {
        logger.error({ error }, `Ping failed (${peerIdStr})${serializeError(error)}`)
      })
    }, pingPeriodSecs * 1000)
  }
}

function stopKeepAlive(peerId) {
  const peerIdStr = peerId.toB58String()

  if (pingKeepAliveTimers[peerIdStr]) {
    clearInterval(pingKeepAliveTimers[peerIdStr])
    delete pingKeepAliveTimers[peerIdStr]
  }
}

module.exports = { startKeepAlive, stopKeepAlive }
