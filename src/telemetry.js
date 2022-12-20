
import path from 'path'
import { Telemetry, dirname } from 'e-ipfs-core-lib'
import { logger } from './logging.js'

const configFile = path.join(dirname(import.meta.url), '../metrics.yml')
const telemetry = new Telemetry({ configFile, logger })
export { telemetry }
