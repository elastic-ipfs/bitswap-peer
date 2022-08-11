'use strict'

const { EventEmitter } = require('events')
const lengthPrefixedMessage = require('it-length-prefixed')
const pipe = require('it-pipe')

const { logger, serializeError } = require('./logging')

class Connection extends EventEmitter {
  constructor(stream) {
    super()

    this.stream = stream
    this.done = false
    this.values = []
    this.resolves = []
    this.shouldClose = false

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
          return Promise.resolve({ done: true, value: undefined })
        }

        // Return a new pending promise that it will be fulfilled as soon as value is available
        return new Promise(resolve => this.resolves.push(resolve))
      }
    }
  }
}

module.exports = { Connection }
