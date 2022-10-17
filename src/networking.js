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

    loadEsmModules(['it-length-prefixed', 'it-pipe'])
      .then(([lengthPrefixedMessage, { pipe }]) => {
        try {
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
              logger.debug({ err: serializeError(err) }, 'Cannot receive data')
            })

          // Prepare for sending
          pipe(this, lengthPrefixedMessage.encode(), stream.sink)
            .then(() => {
              this.emit('end:send')
            })
            .catch(err => {
              this.emit('error', err)
              this.emit('error:send', err)
              logger.debug({ err: serializeError(err) }, 'Cannot send data')
            })
        } catch (err) {
          // TODO introduce async "init" method
          // the connection is ready after init, the constructor cant be async
          // this is a temp solution to prevent unhandled rejections
          // see connectPeer function
          logger.error({ err: serializeError(err) }, 'connection stream pipe')
          this.emit('error:pipe', err)
        }
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

async function connectPeer({ context, logger }) {
  try {
    const stream = await _acquireStream(context)
    const connection = new Connection(stream)

    connection.on('error', err => {
      logger.warn({ err: serializeError(err) }, 'outgoing connection error')
      context.state = 'error'
    })

    connection.on('error:pipe', () => {
      context.state = 'error'
    })

    // TODO should resolve on connection ready
    // Connection class should expose a "ready" event or something
    // see service.on('peer:connect') and service.on('peer:disconnect') on service.js
    return connection
  } catch (err) {
    context.state = 'error'
    logger.error({ err: serializeError(err), peerId: context.peerId?._idB58String || context.peerId }, 'outgoing connection error, unable to connect to peer')
    throw err
  }
}

/**
 * establish connection, deduping by peer
 * coupled with _connect
 */
async function _acquireStream(context) {
  const dialConnection = await context.service.dial(context.peerId)
  const { stream } = await dialConnection.newStream(context.protocol)
  return stream
}

module.exports = { Connection, connectPeer }
