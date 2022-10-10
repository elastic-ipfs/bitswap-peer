'use strict'

const { EventEmitter } = require('events')
const { loadEsmModules } = require('./esm-loader')
const { logger, serializeError } = require('./logging')

class Connection extends EventEmitter {
  constructor(stream) {
    super()

    this.stream = stream
    this.done = false
    this.values = []
    this.resolves = []
    this.shouldClose = false

    loadEsmModules(['it-length-prefixed', 'it-pipe']).then(([lengthPrefixedMessage, { pipe }]) => {
      // Prepare for receiving
      pipe(stream.source, lengthPrefixedMessage.decode(), async source => {
        for await (const data of source) {
          /*
            This variable declaration is important
            If you use data.slice() within the nextTick you will always emit the last received packet
          */
          const payload = data.slice()
          process.nextTick(() => this.emit('data', payload))
        }
      })
        .then(() => {
          this.emit('end:receive')
        })
        .catch(err => {
          this.emit('error', err)
          this.emit('error:receive', err)
          logger.debug({ err }, `Cannot receive data: ${serializeError(err)}`)
        })

      // Prepare for sending
      pipe(this, lengthPrefixedMessage.encode(), stream.sink)
        .then(() => {
          this.emit('end:send')
        })
        .catch(err => {
          this.emit('error', err)
          this.emit('error:send', err)
          logger.debug({ err }, `Cannot send data: ${serializeError(err)}`)
        })
    })
  }

  send(value) {
    if (this.shouldClose || this.done) {
      throw new Error('The stream is closed.')
    }

    const resolve = this.resolves.shift()

    if (resolve) {
      return resolve({ done: false, value })
    }

    this.values.push(value)
  }

  close() {
    /*
      Do not do anything immediately here, just wait for the next request for data.
      This way we are sure we have sent everything out.
    */

    this.shouldClose = true

    // If there are resolves, then there is nothing waiting to be sent out and
    // we can close the stream for reading (and writing) immediately.
    if (this.resolves.length) {
      for (const resolve of this.resolves) {
        resolve({ done: true })
      }
      this.resolves = []
      this.stream.close()
      this.emit('close')
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        // Marked as done, exit without processing additional values
        if (this.done) {
          return Promise.resolve({ done: true, value: undefined })
        }

        // There is a value in the queue, return it
        const value = this.values.shift()

        if (value) {
          return Promise.resolve({ done: false, value })
        }

        // If we should close, do not wait for new data but rather signal we're done
        if (this.shouldClose) {
          this.done = true

          for (const resolve of this.resolves) {
            resolve({ done: true, value: undefined })
          }

          this.resolves = []
          this.stream.close() // close the stream (read side)
          this.emit('close')
          return Promise.resolve({ done: true, value: undefined })
        }

        // Return a new pending promise that it will be fulfilled as soon as value is available
        return new Promise(resolve => this.resolves.push(resolve))
      }
    }
  }
}

/**
 * this a temporary solution to manage connections
 * the main purpose is to avoid to call the peer connection process on every request, if the connection is still established
 * this kind of overlap the libp2p connectionManager, so we're going to adopt it after upgrading the libp2p to the last version
 */
class PeerConnectionPool {
  constructor({ idle = 2e3, polling = 2e3 } = {}) {
    this.options = {
      idle,
      polling
    }

    this._pool = new Map()
    this._timers = new Map()
    this._pending = new Map()

    this.timerPolling()
  }

  static peerId(peer) {
    // TODO throw err invalid peer?
    return peer._idB58String
  }

  connections() {
    return Array.from(this._pool.values())
  }

  set(peer, connection) {
    const id = PeerConnectionPool.peerId(peer)
    this._pool.set(id, connection)
    this._timers.set(id, Date.now())
  }

  get(peer) {
    const id = PeerConnectionPool.peerId(peer)
    if (!id) { return }
    this._timers.set(id, Date.now())
    return this._pool.get(id)
  }

  remove(peer) {
    const id = PeerConnectionPool.peerId(peer)
    if (!id) { return }
    this._pool.delete(id)
    this._timers.delete(id)
  }

  addPending(peer) {
    const id = PeerConnectionPool.peerId(peer)
    const c = this._pending.get(id) ?? 0
    this._pending.set(id, c + 1)
  }

  removePending(peer) {
    const id = PeerConnectionPool.peerId(peer)
    const c = this._pending.get(id) ?? 0
    if (c === undefined) {
      this._pending.set(id, 0)
      return
    }
    this._pending.set(id, c - 1)
  }

  close(id) {
    const c = this._pool.get(id)
    if (!c) { return }
    c.close()
    this._pool.delete(id)
    this._timers.delete(id)
  }

  timerPolling() {
    if (this.polling) { return }
    this.polling = setInterval(() => {
      const now = Date.now()
      for (const [id, t] of this._timers.entries()) {
        const pending = this._pending.get(id)
        if (pending < 1 && t < now - this.options.idle) {
          this.close(id)
        }
      }
    }, this.options.polling).unref()
  }
}

module.exports = { Connection, PeerConnectionPool }
