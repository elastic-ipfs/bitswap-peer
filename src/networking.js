'use strict'

const { EventEmitter } = require('events')
const { loadEsmModules } = require('./esm-loader')
const { logger, serializeError } = require('./logging')

class Connection extends EventEmitter {
  // !TODO .setMaxListeners()
  constructor(stream) {
    super()

    this.stream = stream
    this.done = false
    this.values = []
    this.resolves = []
    this.shouldClose = false

    loadEsmModules(['it-length-prefixed', 'it-pipe'])
      .then(([lengthPrefixedMessage, { pipe }]) => {
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
    try {
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
    } catch (error) {
      logger.error({ error: serializeError(error) }, 'error on connection.close')
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
  constructor({ logger, idle = 2e3, polling = 2e3 } = {}) {
    this.options = {
      idle,
      polling
    }
    this.logger = logger

    // to dedupe getting connection
    this._connecting = new Map()

    this._pool = new Map()
    this._timers = new Map()
    this._pending = new Map()

    this.timerPolling()
  }

  // throw err on invalid peer
  static peerId(peerId) {
    return peerId._idB58String
  }

  connections() {
    return Array.from(this._pool.values())
  }

  /**
   * assumes peerId has always the same `protocol` and `service`
   */
  async acquire({ peerId, protocol, service }) {
    let connection = this.get(peerId)
    if (connection) {
      // refresh timer
      this._timers.set(PeerConnectionPool.peerId(peerId), Date.now())
      return connection
    }

    connection = await this._connect({ peerId, protocol, service })
    this.set(peerId, connection)

    return connection
  }

  /**
   * establish connection, deduping by peerId
   * coupled with acquire
   */
  _connect({ peerId, protocol, service }) {
    const id = PeerConnectionPool.peerId(peerId)

    let p = this._connecting.get(id)
    if (p) {
      console.log(' **** connection deduped', id)
      return p
    }

    p = new Promise((resolve, reject) => {
      this._acquireStream({ peerId, protocol, service })
        .then((stream) => {
          const connection = new Connection(stream)

          connection.on('error', err => {
            this.logger.warn({ err: serializeError(err) }, 'outgoing connection error')
            reject(err)
          })

          connection.on('close', () => { this.close(id) })

          // TODO should resolve on connection ready
          // Connection class should expose a "ready" event or something
          // see service.on('peer:connect') and service.on('peer:disconnect') on service.js
          resolve(connection)
        })
        .catch(err => reject(err))
    })

    this._connecting.set(id, p)

    return p
  }

  /**
   * establish connection, deduping by peer
   * coupled with _connect
   */
  async _acquireStream({ peerId, protocol, service }) {
    const dialConnection = await service.dial(peerId)
    const { stream } = await dialConnection.newStream(protocol)
    return stream
  }

  // --- connection pool

  set(peerId, connection) {
    const id = PeerConnectionPool.peerId(peerId)
    this._pool.set(id, connection)
    this._timers.set(id, Date.now())
  }

  get(peerId) {
    const id = PeerConnectionPool.peerId(peerId)
    if (!id) { return }
    return this._pool.get(id)
  }

  remove(peerId) {
    const id = PeerConnectionPool.peerId(peerId)
    if (!id) { return }
    this._pool.delete(id)
    this._timers.delete(id)
    this._pending.delete(id)
    this._connecting.delete(id)
  }

  addPending(peerId) {
    const id = PeerConnectionPool.peerId(peerId)
    const c = this._pending.get(id) ?? 0
    this._pending.set(id, c + 1)
  }

  removePending(peerId) {
    const id = PeerConnectionPool.peerId(peerId)
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

    this._connecting.delete(id)
    this._pool.delete(id)
    this._timers.delete(id)
    this._pending.delete(id)

    c.close()
    c.removeAllListeners()
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
