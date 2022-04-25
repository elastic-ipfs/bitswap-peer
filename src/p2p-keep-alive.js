/*
This is a workaround for ERR_MPLEX_STREAM_RESET errors
This is related to:
https://github.com/libp2p/js-libp2p-mplex/issues/111
https://github.com/libp2p/js-libp2p-interfaces/pull/90
https://github.com/libp2p/js-libp2p-mplex/pull/121
This was written based on:
https://github.com/status-im/js-waku/issues/185
*/

const { PingService } = require('libp2p/src/ping')
const { logger, serializeError } = require('./logging')
const { pingPeriodSecs } = require('./config')

const pingKeepAliveTimers = {}

function startKeepAlive(peerId, libp2p) {
  // Just in case a timer already exist for this peer
  this.stopKeepAlive(peerId)

  const peerIdStr = peerId.toB58String()

  //TODO: Delete this, just for testing
  logger.info(('** peerId' = peerId))
  logger.info(('** libp2p' = libp2p))
  logger.info(('** pingPeriodSecs' = pingPeriodSecs))
  //
  if (pingPeriodSecs !== 0) {
    const pingService = new PingService(libp2p)
    logger.info(('** started pingService' = pingPeriodSecs))
    pingKeepAliveTimers[peerIdStr] = setInterval(() => {
      logger.info(('** Hit interval, time to ping!'))
      pingService.ping(peerId).catch(error => {
        logger.error({ error }, `Ping failed (${peerIdStr})${serializeError(error)}`)
      })
    }, pingPeriodSecs * 1000)
  }
}

function stopKeepAlive(peerId) {
  const peerIdStr = peerId.toB58String()

  if (this.pingKeepAliveTimers[peerIdStr]) {
    clearInterval(this.pingKeepAliveTimers[peerIdStr])
    delete this.pingKeepAliveTimers[peerIdStr]
  }
}

module.exports = { startKeepAlive, stopKeepAlive }
