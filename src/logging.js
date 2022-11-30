
import { createLogger } from 'e-ipfs-core-lib'
import { version } from './util.js'

let level = 'info'

if (process.env.LOG_LEVEL) {
  level = process.env.LOG_LEVEL
} else if (process.env.NODE_DEBUG) {
  level = 'debug'
}

const pretty = Boolean(process.env.LOG_PRETTY === 'true')
const logger = createLogger({ version, level, pretty })

export {
  logger
}
