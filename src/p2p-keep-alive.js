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

const pingKeepAliveTimers = {}
// const relayKeepAliveTimers = {}
const pingPeriodSecs = process.env.PING_PERIOD_SECONDS ?? 10
// export const DefaultRelayKeepAliveValueSecs = 5 * 60

function startKeepAlive(peerId, libp2p) {
  // Just in case a timer already exist for this peer
  this.stopKeepAlive(peerId)

  const peerIdStr = peerId.toB58String()

  if (pingPeriodSecs !== 0) {
    const pingService = new PingService(libp2p)
    pingKeepAliveTimers[peerIdStr] = setInterval(() => {
      pingService.ping(peerId).catch(error => {
        logger.error({ error }, `Ping failed (${peerIdStr})${serializeError(error)}`)
      })
    }, pingPeriodSecs * 1000)
  }

  // if (relayPeriodSecs !== 0) { // TODO: What exactly is the purpose of that?
  //   relayKeepAliveTimers[peerIdStr] = setInterval(() => {
  //     // TODO: Convert this wakuMessage to something more meaningful to us
  //     WakuMessage.fromBytes(new Uint8Array(), RelayPingContentTopic).then(wakuMsg => this.relay.send(wakuMsg))
  //   }, relayPeriodSecs * 1000)
  // }
}

function stopKeepAlive(peerId) {
  const peerIdStr = peerId.toB58String()

  if (this.pingKeepAliveTimers[peerIdStr]) {
    clearInterval(this.pingKeepAliveTimers[peerIdStr])
    delete this.pingKeepAliveTimers[peerIdStr]
  }

  if (this.relayKeepAliveTimers[peerIdStr]) {
    clearInterval(this.relayKeepAliveTimers[peerIdStr])
    delete this.relayKeepAliveTimers[peerIdStr]
  }
}

module.exports = { startKeepAlive, stopKeepAlive }
