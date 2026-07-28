import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { normalizeDiscordWebhookUrl } from './discord-moderation.js'

export const SECURE_CONFIG_KEYS = [
  'HOST',
  'PORT',
  'DATA_PATH',
  'DASHBOARD_PASSWORD',
  'DASHBOARD_SESSION_SECRET',
  'DASHBOARD_SECURE_COOKIE',
  'PZ_RCON_HOST',
  'PZ_RCON_PORT',
  'PZ_RCON_PASSWORD',
  'PZ_RCON_POLL_SECONDS',
  'PZ_CONFIG_PATH',
  'PZ_SANDBOX_PATH',
  'PZ_TELEMETRY_TOKEN',
  'PZ_TELEMETRY_FTP_HOST',
  'PZ_TELEMETRY_FTP_PORT',
  'PZ_TELEMETRY_FTP_USER',
  'PZ_TELEMETRY_FTP_PASSWORD',
  'PZ_TELEMETRY_FTP_SECURE',
  'PZ_TELEMETRY_FTP_PATH',
  'PZ_TELEMETRY_FTP_POLL_SECONDS',
  'PZ_CONFIG_FTP_PATH',
  'PZ_SANDBOX_FTP_PATH',
  'PZ_PLAYER_AUTH_ENABLED',
  'PZ_PLAYER_SESSION_SECRET',
  'PZ_PLAYER_DB_FTP_HOST',
  'PZ_PLAYER_DB_FTP_PORT',
  'PZ_PLAYER_DB_FTP_USER',
  'PZ_PLAYER_DB_FTP_PASSWORD',
  'PZ_PLAYER_DB_FTP_SECURE',
  'PZ_PLAYER_DB_FTP_PATH',
  'PZ_PLAYER_DB_WORLD',
  'PZ_BRAND_NAME',
  'PZ_BRAND_INITIALS',
  'PZ_BRAND_TAGLINE',
  'PZ_PORTAL_TITLE',
  'PZ_PORTAL_DESCRIPTION',
  'PZ_PLAYER_JOIN_ADDRESS',
  'PZ_PLAYER_DISCORD_URL',
  'PZ_PLAYER_RULES_URL',
  'PZ_PLAYER_MODS_URL',
  'PZ_PLAYER_RESTART_SCHEDULE',
  'PZ_PLAYER_ANNOUNCEMENT',
  'PZ_DISCORD_MOD_WEBHOOK_URL',
  'PZ_PROVIDER_NAME',
  'PZ_PROVIDER_URL',
  'PZ_SETUP_PUBLIC_URL',
  'GPORTAL_SERVER_URL',
] as const

export type SecureConfigKey = typeof SECURE_CONFIG_KEYS[number]
export type SecureConfig = Partial<Record<SecureConfigKey, string>>

interface EncryptedConfigFile {
  version: 1
  algorithm: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

export interface SecureConfigState {
  configured: boolean
  directory: string
  keys: SecureConfigKey[]
}

const keyName = 'master.key'
const configName = 'config.enc.json'

export function secureConfigDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.PZ_SECURE_CONFIG_DIR?.trim()
  return resolve(configured || join(homedir(), '.config', 'pz-rcon-admin'))
}

function paths(directory: string) {
  return {
    key: join(directory, keyName),
    config: join(directory, configName),
    temporary: join(directory, `${configName}.tmp`),
  }
}

function normalize(input: Record<string, unknown>): SecureConfig {
  const allowed = new Set<string>(SECURE_CONFIG_KEYS)
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    if (!allowed.has(key) || typeof value !== 'string') return []
    return [[key, value.slice(0, 4_096)]]
  })) as SecureConfig
}

export function buildInitialSecureConfig(value: unknown): SecureConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration is required')
  const source = value as Record<string, unknown>
  const allowed = new Set<string>(SECURE_CONFIG_KEYS)
  const config = Object.fromEntries(Object.entries(source).flatMap(([key, raw]) => (
    allowed.has(key) && ['string', 'number', 'boolean'].includes(typeof raw)
      ? [[key, String(raw).trim().slice(0, 4_096)]]
      : []
  ))) as SecureConfig

  if ((config.DASHBOARD_PASSWORD?.length ?? 0) < 16) throw new Error('Dashboard password must be at least 16 characters')
  if (!config.PZ_RCON_HOST) throw new Error('RCON host is required')
  const rconPort = Number(config.PZ_RCON_PORT)
  if (!Number.isInteger(rconPort) || rconPort < 1 || rconPort > 65_535) throw new Error('RCON port must be between 1 and 65535')
  if (!config.PZ_RCON_PASSWORD) throw new Error('RCON password is required')
  const rconPollSeconds = Number(config.PZ_RCON_POLL_SECONDS || 15)
  if (!Number.isInteger(rconPollSeconds) || rconPollSeconds < 5) {
    throw new Error('RCON poll interval must be at least 5 seconds')
  }
  if (config.DASHBOARD_SESSION_SECRET && config.DASHBOARD_SESSION_SECRET.length < 32) {
    throw new Error('Dashboard session secret must be at least 32 characters or left blank for automatic generation')
  }
  if (config.PZ_PLAYER_SESSION_SECRET && config.PZ_PLAYER_SESSION_SECRET.length < 32) {
    throw new Error('Player session secret must be at least 32 characters or left blank for automatic generation')
  }
  if (config.PZ_DISCORD_MOD_WEBHOOK_URL) {
    config.PZ_DISCORD_MOD_WEBHOOK_URL = normalizeDiscordWebhookUrl(config.PZ_DISCORD_MOD_WEBHOOK_URL)
  }

  config.DASHBOARD_SESSION_SECRET ||= randomBytes(32).toString('base64url')
  config.DASHBOARD_SECURE_COOKIE = config.DASHBOARD_SECURE_COOKIE === 'true' ? 'true' : 'false'
  config.PZ_RCON_POLL_SECONDS = String(rconPollSeconds)
  config.PZ_PLAYER_AUTH_ENABLED = config.PZ_PLAYER_AUTH_ENABLED === 'true' ? 'true' : 'false'
  if (config.PZ_PLAYER_AUTH_ENABLED === 'true') {
    config.PZ_PLAYER_SESSION_SECRET ||= randomBytes(32).toString('base64url')
    if (config.PZ_PLAYER_DB_FTP_SECURE) {
      config.PZ_PLAYER_DB_FTP_SECURE = ['true', 'implicit'].includes(config.PZ_PLAYER_DB_FTP_SECURE)
        ? config.PZ_PLAYER_DB_FTP_SECURE
        : 'false'
    }
    config.PZ_PLAYER_DB_FTP_PATH ||= 'db/servertest.db'
    config.PZ_PLAYER_DB_WORLD ||= 'servertest'
  }
  if (config.PZ_TELEMETRY_FTP_HOST) {
    const world = config.PZ_PLAYER_DB_WORLD || 'servertest'
    config.PZ_TELEMETRY_FTP_PORT ||= '21'
    config.PZ_TELEMETRY_FTP_SECURE = ['true', 'implicit'].includes(config.PZ_TELEMETRY_FTP_SECURE ?? '')
      ? config.PZ_TELEMETRY_FTP_SECURE
      : 'false'
    config.PZ_TELEMETRY_FTP_PATH ||= 'Lua/PZRconAdminTelemetry/players.json'
    config.PZ_TELEMETRY_FTP_POLL_SECONDS ||= '5'
    config.PZ_CONFIG_FTP_PATH ||= `Server/${world}.ini`
    config.PZ_SANDBOX_FTP_PATH ||= `Server/${world}_SandboxVars.lua`
  }
  return config
}

function readKey(path: string): Buffer {
  const key = readFileSync(path)
  if (key.length !== 32) throw new Error('Secure configuration key is invalid')
  return key
}

export function loadSecureConfig(directory = secureConfigDirectory()): SecureConfig {
  const location = paths(directory)
  if (!existsSync(location.key) || !existsSync(location.config)) return {}
  const key = readKey(location.key)
  const payload = JSON.parse(readFileSync(location.config, 'utf8')) as EncryptedConfigFile
  if (payload.version !== 1 || payload.algorithm !== 'aes-256-gcm') throw new Error('Secure configuration format is unsupported')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
    decipher.final(),
  ])
  return normalize(JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>)
}

export function saveSecureConfig(input: Record<string, unknown>, directory = secureConfigDirectory()): SecureConfigState {
  const config = normalize(input)
  if (!Object.keys(config).length) throw new Error('Secure configuration cannot be empty')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const location = paths(directory)
  if (!existsSync(location.key)) writeFileSync(location.key, randomBytes(32), { flag: 'wx', mode: 0o600 })
  chmodSync(location.key, 0o600)
  const key = readKey(location.key)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()])
  const payload: EncryptedConfigFile = {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  }
  writeFileSync(location.temporary, `${JSON.stringify(payload)}\n`, { mode: 0o600 })
  chmodSync(location.temporary, 0o600)
  renameSync(location.temporary, location.config)
  chmodSync(location.config, 0o600)
  return { configured: true, directory, keys: Object.keys(config) as SecureConfigKey[] }
}

export function applySecureConfig(environment: NodeJS.ProcessEnv = process.env): SecureConfigState {
  const directory = secureConfigDirectory(environment)
  const config = loadSecureConfig(directory)
  for (const [key, value] of Object.entries(config)) {
    if (environment[key] === undefined || environment[key] === '') environment[key] = value
  }
  return {
    configured: Object.keys(config).length > 0,
    directory,
    keys: Object.keys(config) as SecureConfigKey[],
  }
}
