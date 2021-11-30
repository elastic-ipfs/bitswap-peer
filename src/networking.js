'use strict'

const lengthPrefixedMessage = require('it-length-prefixed')
const pipe = require('it-pipe')
const { logger, serializeError } = require('./logging')

function receiveData(stream, callback) {
  pipe(stream, lengthPrefixedMessage.decode(), async source => {
    for await (const data of source) {
      try {
        callback(data.slice())
      } catch (e) {
        logger.error(`Callback error during receiveData: ${serializeError(e)}`)
      }
    }
  }).catch(e => {
    logger.error(`Pipe error during receiveData: ${serializeError(e)}`)
  })
}

async function sendData(stream, message) {
  return pipe([message], lengthPrefixedMessage.encode(), stream)
}

module.exports = { receiveData, sendData }
