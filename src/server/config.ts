import { existsSync, readFileSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { readIni, summarizeConfig } from './ini.js'
import { buildPlayerPortalCommunity, publicHttpUrl, publicText } from './player-portal.js'
import { normalizePublicAdminUrl } from '../shared/routes.js'
import { applySecureConfig } from './secure-config.js'
import { assertStartupSecurity } from './startup-security.js'
import { normalizeTelemetryRemotePath } from '../shared/telemetry-path.js'

try {
  const envPath = process.env.DASHBOARD_ENV_FILE || '.env'
  if (existsSync(envPath)) loadEnvFile(envPath)
} catch {
  // Environment variables supplied by the process still work if .env is absent.
}

const secureConfig = applySecureConfig(process.env)

const configPath = process.env.PZ_CONFIG_PATH
const ini = configPath && existsSync(configPath) ? readIni(configPath) : {}
const configSummary = summarizeConfig(ini)
const int = (value: string | undefined, fallback: number) => {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}
const ftpSecure = (value: string | undefined): boolean | 'implicit' => value === 'implicit' ? 'implicit' : value === 'true'
const playerAuthEnabled = process.env.PZ_PLAYER_AUTH_ENABLED === 'true'
const dashboardPasswordExplicit = Boolean(process.env.DASHBOARD_PASSWORD)
const dashboardSessionSecretExplicit = Boolean(process.env.DASHBOARD_SESSION_SECRET)
const playerSessionSecretExplicit = Boolean(process.env.PZ_PLAYER_SESSION_SECRET)
const dashboardPassword = process.env.DASHBOARD_PASSWORD || (playerAuthEnabled
  ? ini.AdminPassword || process.env.PZ_RCON_PASSWORD || ini.RCONPassword || ''
  : '')
const dashboardSessionSecret = process.env.DASHBOARD_SESSION_SECRET || dashboardPassword || 'local-development-only'
const legacyGportalUrl = process.env.GPORTAL_SERVER_URL

export const appConfig = {
  host: process.env.HOST || '127.0.0.1',
  port: int(process.env.PORT, 8787),
  production: process.env.NODE_ENV === 'production',
  secureConfig,
  dashboardPassword,
  sessionSecret: dashboardSessionSecret,
  playerSessionSecret: process.env.PZ_PLAYER_SESSION_SECRET || dashboardSessionSecret,
  secureCookie: process.env.DASHBOARD_SECURE_COOKIE === 'true',
  trustProxy: process.env.DASHBOARD_TRUST_PROXY?.trim() || '',
  rcon: {
    host: process.env.PZ_RCON_HOST || '',
    port: int(process.env.PZ_RCON_PORT || ini.RCONPort, 0),
    password: process.env.PZ_RCON_PASSWORD || ini.RCONPassword || '',
    pollSeconds: Math.max(5, int(process.env.PZ_RCON_POLL_SECONDS, 15)),
    demo: process.env.PZ_DEMO === 'true',
  },
  configPath: configPath && existsSync(configPath) ? configPath : undefined,
  sandboxPath: process.env.PZ_SANDBOX_PATH && existsSync(process.env.PZ_SANDBOX_PATH)
    ? process.env.PZ_SANDBOX_PATH
    : undefined,
  telemetryToken: process.env.PZ_TELEMETRY_TOKEN || '',
  telemetryFtp: {
    host: process.env.PZ_TELEMETRY_FTP_HOST || '',
    port: int(process.env.PZ_TELEMETRY_FTP_PORT, 21),
    user: process.env.PZ_TELEMETRY_FTP_USER || '',
    password: process.env.PZ_TELEMETRY_FTP_PASSWORD || '',
    secure: ftpSecure(process.env.PZ_TELEMETRY_FTP_SECURE),
    remotePath: normalizeTelemetryRemotePath(process.env.PZ_TELEMETRY_FTP_PATH),
    pollSeconds: Math.max(5, int(process.env.PZ_TELEMETRY_FTP_POLL_SECONDS, 5)),
  },
  serverConfigFtp: {
    host: process.env.PZ_TELEMETRY_FTP_HOST || '',
    port: int(process.env.PZ_TELEMETRY_FTP_PORT, 21),
    user: process.env.PZ_TELEMETRY_FTP_USER || '',
    password: process.env.PZ_TELEMETRY_FTP_PASSWORD || '',
    secure: ftpSecure(process.env.PZ_TELEMETRY_FTP_SECURE),
    configPath: configPath && existsSync(configPath)
      ? undefined
      : process.env.PZ_CONFIG_FTP_PATH || 'Server/servertest.ini',
    sandboxPath: process.env.PZ_SANDBOX_PATH && existsSync(process.env.PZ_SANDBOX_PATH)
      ? undefined
      : process.env.PZ_SANDBOX_FTP_PATH || 'Server/servertest_SandboxVars.lua',
    pollSeconds: Math.max(15, int(process.env.PZ_CONFIG_FTP_POLL_SECONDS, 60)),
  },
  playerAuth: {
    enabled: playerAuthEnabled,
    host: process.env.PZ_PLAYER_DB_FTP_HOST || process.env.PZ_TELEMETRY_FTP_HOST || '',
    port: int(process.env.PZ_PLAYER_DB_FTP_PORT || process.env.PZ_TELEMETRY_FTP_PORT, 21),
    user: process.env.PZ_PLAYER_DB_FTP_USER || process.env.PZ_TELEMETRY_FTP_USER || '',
    password: process.env.PZ_PLAYER_DB_FTP_PASSWORD || process.env.PZ_TELEMETRY_FTP_PASSWORD || '',
    secure: ftpSecure(process.env.PZ_PLAYER_DB_FTP_SECURE || process.env.PZ_TELEMETRY_FTP_SECURE),
    remotePath: process.env.PZ_PLAYER_DB_FTP_PATH || 'db/servertest.db',
    world: process.env.PZ_PLAYER_DB_WORLD || 'servertest',
  },
  playerPortal: buildPlayerPortalCommunity(process.env, configSummary.name),
  provider: {
    name: publicText(process.env.PZ_PROVIDER_NAME, 80) || (legacyGportalUrl ? 'G-Portal' : 'Server provider'),
    url: publicHttpUrl(process.env.PZ_PROVIDER_URL || legacyGportalUrl),
  },
  discordModerationWebhookUrl: process.env.PZ_DISCORD_MOD_WEBHOOK_URL || '',
  adminPublicUrl: normalizePublicAdminUrl(process.env.PZ_ADMIN_PUBLIC_URL),
  dataPath: process.env.DATA_PATH || 'data/dashboard.json',
  configSummary,
  sandboxText: process.env.PZ_SANDBOX_PATH && existsSync(process.env.PZ_SANDBOX_PATH)
    ? readFileSync(process.env.PZ_SANDBOX_PATH, 'utf8')
    : undefined,
  securityWarnings: [
    playerAuthEnabled && !dashboardPasswordExplicit
      ? 'DASHBOARD_PASSWORD is not set; bootstrap access is reusing a Project Zomboid administrator or RCON secret.'
      : undefined,
    !dashboardSessionSecretExplicit
      ? 'DASHBOARD_SESSION_SECRET is not set; bootstrap sessions are reusing a fallback secret.'
      : undefined,
    playerAuthEnabled && !playerSessionSecretExplicit
      ? 'PZ_PLAYER_SESSION_SECRET is not set; player sessions are reusing a fallback secret.'
      : undefined,
  ].filter((warning): warning is string => Boolean(warning)),
}

assertStartupSecurity({
  host: appConfig.host,
  dashboardPassword: appConfig.dashboardPassword,
  playerAuthEnabled: appConfig.playerAuth.enabled,
  secureConfigConfigured: appConfig.secureConfig.configured,
})
