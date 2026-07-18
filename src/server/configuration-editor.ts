import {
  buildInitialSecureConfig,
  type SecureConfig,
  type SecureConfigKey,
} from './secure-config.js'

export const EDITABLE_SECRET_CONFIG_KEYS = [
  'DASHBOARD_PASSWORD',
  'DASHBOARD_SESSION_SECRET',
  'PZ_RCON_PASSWORD',
  'PZ_TELEMETRY_TOKEN',
  'PZ_TELEMETRY_FTP_PASSWORD',
  'PZ_PLAYER_SESSION_SECRET',
  'PZ_PLAYER_DB_FTP_PASSWORD',
] as const satisfies readonly SecureConfigKey[]

export const CLEARABLE_SECRET_CONFIG_KEYS = [
  'DASHBOARD_SESSION_SECRET',
  'PZ_TELEMETRY_TOKEN',
  'PZ_TELEMETRY_FTP_PASSWORD',
  'PZ_PLAYER_SESSION_SECRET',
  'PZ_PLAYER_DB_FTP_PASSWORD',
] as const satisfies readonly SecureConfigKey[]

export const EDITABLE_PLAIN_CONFIG_KEYS = [
  'DASHBOARD_SECURE_COOKIE',
  'PZ_RCON_HOST',
  'PZ_RCON_PORT',
  'PZ_CONFIG_PATH',
  'PZ_SANDBOX_PATH',
  'PZ_TELEMETRY_FTP_HOST',
  'PZ_TELEMETRY_FTP_PORT',
  'PZ_TELEMETRY_FTP_USER',
  'PZ_TELEMETRY_FTP_SECURE',
  'PZ_TELEMETRY_FTP_PATH',
  'PZ_TELEMETRY_FTP_POLL_SECONDS',
  'PZ_CONFIG_FTP_PATH',
  'PZ_SANDBOX_FTP_PATH',
  'PZ_PLAYER_AUTH_ENABLED',
  'PZ_PLAYER_DB_FTP_HOST',
  'PZ_PLAYER_DB_FTP_PORT',
  'PZ_PLAYER_DB_FTP_USER',
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
  'PZ_PROVIDER_NAME',
  'PZ_PROVIDER_URL',
] as const satisfies readonly SecureConfigKey[]

type EditableSecretKey = typeof EDITABLE_SECRET_CONFIG_KEYS[number]
type ClearableSecretKey = typeof CLEARABLE_SECRET_CONFIG_KEYS[number]

export interface EditableSecureConfigState {
  values: Partial<Record<typeof EDITABLE_PLAIN_CONFIG_KEYS[number], string>>
  secretsConfigured: Record<EditableSecretKey, boolean>
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration is required')
  return value as Record<string, unknown>
}

function inputString(value: unknown): string | undefined {
  if (!['string', 'number', 'boolean'].includes(typeof value)) return undefined
  return String(value).trim().slice(0, 4_096)
}

export function editableSecureConfigState(config: SecureConfig): EditableSecureConfigState {
  return {
    values: Object.fromEntries(EDITABLE_PLAIN_CONFIG_KEYS.flatMap((key) => (
      config[key] === undefined ? [] : [[key, config[key]]]
    ))) as EditableSecureConfigState['values'],
    secretsConfigured: Object.fromEntries(EDITABLE_SECRET_CONFIG_KEYS.map((key) => [key, Boolean(config[key])])) as Record<EditableSecretKey, boolean>,
  }
}

export function updateEditableSecureConfig(current: SecureConfig, value: unknown): SecureConfig {
  const request = record(value)
  const supplied = record(request.config)
  const next: SecureConfig = { ...current }

  for (const key of EDITABLE_PLAIN_CONFIG_KEYS) {
    if (!(key in supplied)) continue
    const normalized = inputString(supplied[key])
    if (normalized === undefined) continue
    if (normalized) next[key] = normalized
    else delete next[key]
  }

  for (const key of EDITABLE_SECRET_CONFIG_KEYS) {
    if (!(key in supplied)) continue
    const normalized = inputString(supplied[key])
    if (normalized) next[key] = normalized
  }

  const clearable = new Set<ClearableSecretKey>(CLEARABLE_SECRET_CONFIG_KEYS)
  if (Array.isArray(request.clearSecrets)) {
    for (const key of request.clearSecrets) {
      if (typeof key === 'string' && clearable.has(key as ClearableSecretKey)) delete next[key as ClearableSecretKey]
    }
  }

  return buildInitialSecureConfig(next)
}
