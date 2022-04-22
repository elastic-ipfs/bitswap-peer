/*
This is a workaround for ERR_MPLEX_STREAM_RESET errors
This is related to:
https://github.com/libp2p/js-libp2p-mplex/issues/111
https://github.com/libp2p/js-libp2p-interfaces/pull/90
https://github.com/libp2p/js-libp2p-mplex/pull/121
This was written based on:
https://github.com/status-im/js-waku/issues/185
*/

import PingService from 'libp2p/src/ping'

const pingKeepAliveTimers = {}
const relayKeepAliveTimers = {}

function startKeepAlive(peerId, pingPeriodSecs, relayPeriodSecs) {
  // Just in case a timer already exist for this peer
  this.stopKeepAlive(peerId)

  const peerIdStr = peerId.toB58String()

  if (pingPeriodSecs !== 0) {
    const pingService = new PingService(this.libp2p)
    pingKeepAliveTimers[peerIdStr] = setInterval(() => {
      pingService.ping(peerId).catch(e => {
        dbg(`Ping failed (${peerIdStr})`, e)
      })
    }, pingPeriodSecs * 1000)
  }

  if (relayPeriodSecs !== 0) { // TODO: What exactly is the purpose of that?
    relayKeepAliveTimers[peerIdStr] = setInterval(() => {
      // TODO: Convert this wakuMessage to something more meaningful to us
      WakuMessage.fromBytes(new Uint8Array(), RelayPingContentTopic).then(wakuMsg => this.relay.send(wakuMsg))
    }, relayPeriodSecs * 1000)
  }
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
