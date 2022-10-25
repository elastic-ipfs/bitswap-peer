
// TODO upgrade libp2p and drop

/*
This is a workaround for ERR_MPLEX_STREAM_RESET errors
This is related to:
https://github.com/libp2p/js-libp2p-mplex/issues/111
https://github.com/libp2p/js-libp2p-interfaces/pull/90
https://github.com/libp2p/js-libp2p-mplex/pull/121
This was written based on:
https://github.com/status-im/js-waku/issues/185
*/

import { logger, serializeError } from './logging.js'
import config from './config.js'

const pingKeepAliveTimers = {}

function startKeepAlive (peerId, currentNode) {
  if (!peerId) { return }
  // Just in case a timer already exist for this peer
  stopKeepAlive(peerId)

  const peerIdStr = peerId.toString()

  if (config.pingPeriodSecs !== 0) {
    pingKeepAliveTimers[peerIdStr] = setInterval(() => {
      currentNode.ping(peerId).catch(err => {
        if (err.code !== 'ERR_MPLEX_STREAM_RESET' && err.code !== 'ERR_UNSUPPORTED_PROTOCOL') {
          logger.debug({ err }, `Ping failed - peerId: ${peerIdStr} Error: ${serializeError(err)}`)
        }
        stopKeepAlive(peerId)
      })
    }, config.pingPeriodSecs * 1000)
  }
}

function stopKeepAlive (peerId) {
  if (!peerId) { return }
  const peerIdStr = peerId.toString()

  if (pingKeepAliveTimers[peerIdStr]) {
    clearInterval(pingKeepAliveTimers[peerIdStr])
    delete pingKeepAliveTimers[peerIdStr]
  }
}

export { startKeepAlive, stopKeepAlive }
