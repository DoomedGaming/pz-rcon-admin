import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { readIni } from './ini.js'
import { saveSecureConfig, secureConfigDirectory } from './secure-config.js'

const source = process.argv[2]
if (!source) throw new Error('Usage: npm run config:import -- /absolute/path/to/config.env')

const values = parseEnv(readFileSync(source, 'utf8'))
const ini = values.PZ_CONFIG_PATH && existsSync(values.PZ_CONFIG_PATH) ? readIni(values.PZ_CONFIG_PATH) : {}

values.PZ_RCON_PORT ||= ini.RCONPort ?? ''
values.PZ_RCON_PASSWORD ||= ini.RCONPassword ?? ''
if (values.PZ_PLAYER_AUTH_ENABLED === 'true') {
  values.DASHBOARD_PASSWORD ||= ini.AdminPassword || values.PZ_RCON_PASSWORD || ''
  values.PZ_PLAYER_SESSION_SECRET ||= randomBytes(32).toString('base64url')
}
values.DASHBOARD_SESSION_SECRET ||= randomBytes(32).toString('base64url')

const state = saveSecureConfig(values)
console.log(`Encrypted configuration saved in ${state.directory}`)
console.log(`Stored fields: ${state.keys.sort().join(', ')}`)
console.log('No secret values were printed. Restart the dashboard without the environment file to verify the migration.')

if (state.directory !== secureConfigDirectory()) throw new Error('Secure configuration directory mismatch')
