<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SetupStatus } from '@shared/types'
import { STAFF_CONSOLE_PATH } from '@shared/routes'
import { DEFAULT_TELEMETRY_REMOTE_PATH, normalizeTelemetryRemotePath } from '@shared/telemetry-path'

type SecretKey =
  | 'DASHBOARD_PASSWORD'
  | 'DASHBOARD_SESSION_SECRET'
  | 'PZ_RCON_PASSWORD'
  | 'PZ_TELEMETRY_TOKEN'
  | 'PZ_TELEMETRY_FTP_PASSWORD'
  | 'PZ_PLAYER_SESSION_SECRET'
  | 'PZ_PLAYER_DB_FTP_PASSWORD'
  | 'PZ_DISCORD_MOD_WEBHOOK_URL'

interface ConfigurationState {
  values: Record<string, string>
  secretsConfigured: Record<SecretKey, boolean>
  restartScheduled: boolean
}

const form = ref({
  dashboardPassword: '',
  dashboardPasswordConfirm: '',
  dashboardSessionSecret: '',
  secureCookie: false,
  rconHost: '',
  rconPort: '',
  rconPassword: '',
  rconPollSeconds: '15',
  configPath: '',
  sandboxPath: '',
  telemetryToken: '',
  telemetryHost: '',
  telemetryPort: '21',
  telemetryUser: '',
  telemetryPassword: '',
  telemetrySecure: 'false',
  telemetryPath: DEFAULT_TELEMETRY_REMOTE_PATH,
  telemetryPollSeconds: '5',
  configFtpPath: 'Server/servertest.ini',
  sandboxFtpPath: 'Server/servertest_SandboxVars.lua',
  playerAuthEnabled: false,
  playerSessionSecret: '',
  playerFtpHost: '',
  playerFtpPort: '',
  playerFtpUser: '',
  playerFtpPassword: '',
  playerFtpSecure: '',
  playerDbPath: 'db/servertest.db',
  playerDbWorld: 'servertest',
  brandName: '',
  brandInitials: '',
  brandTagline: '',
  portalTitle: '',
  portalDescription: '',
  joinAddress: '',
  discordUrl: '',
  rulesUrl: '',
  modsUrl: '',
  restartSchedule: '',
  announcement: '',
  providerName: '',
  providerUrl: '',
  discordModWebhookUrl: '',
  adminPublicUrl: '',
})
const clearSecrets = ref<SecretKey[]>([])
const secretsConfigured = ref<Record<SecretKey, boolean>>({
  DASHBOARD_PASSWORD: false,
  DASHBOARD_SESSION_SECRET: false,
  PZ_RCON_PASSWORD: false,
  PZ_TELEMETRY_TOKEN: false,
  PZ_TELEMETRY_FTP_PASSWORD: false,
  PZ_PLAYER_SESSION_SECRET: false,
  PZ_PLAYER_DB_FTP_PASSWORD: false,
  PZ_DISCORD_MOD_WEBHOOK_URL: false,
})
const loading = ref(true)
const loaded = ref(false)
const busy = ref(false)
const saved = ref(false)
const error = ref('')
const restartMessage = ref('Waiting for Docker or the service supervisor to restart the dashboard…')

function configuredHint(key: SecretKey, replacement = 'Enter a replacement or leave blank to keep it.'): string {
  return secretsConfigured.value[key] ? `Stored securely. ${replacement}` : 'Not stored in encrypted configuration.'
}

function value(values: Record<string, string>, key: string, fallback = ''): string {
  return values[key] ?? fallback
}

function hydrate(state: ConfigurationState) {
  const values = state.values
  secretsConfigured.value = state.secretsConfigured
  form.value.secureCookie = value(values, 'DASHBOARD_SECURE_COOKIE') === 'true'
  form.value.rconHost = value(values, 'PZ_RCON_HOST')
  form.value.rconPort = value(values, 'PZ_RCON_PORT')
  form.value.rconPollSeconds = value(values, 'PZ_RCON_POLL_SECONDS', '15')
  form.value.configPath = value(values, 'PZ_CONFIG_PATH')
  form.value.sandboxPath = value(values, 'PZ_SANDBOX_PATH')
  form.value.telemetryHost = value(values, 'PZ_TELEMETRY_FTP_HOST')
  form.value.telemetryPort = value(values, 'PZ_TELEMETRY_FTP_PORT', '21')
  form.value.telemetryUser = value(values, 'PZ_TELEMETRY_FTP_USER')
  form.value.telemetrySecure = value(values, 'PZ_TELEMETRY_FTP_SECURE', 'false')
  form.value.telemetryPath = normalizeTelemetryRemotePath(value(values, 'PZ_TELEMETRY_FTP_PATH', DEFAULT_TELEMETRY_REMOTE_PATH))
  form.value.telemetryPollSeconds = value(values, 'PZ_TELEMETRY_FTP_POLL_SECONDS', '5')
  form.value.configFtpPath = value(values, 'PZ_CONFIG_FTP_PATH', 'Server/servertest.ini')
  form.value.sandboxFtpPath = value(values, 'PZ_SANDBOX_FTP_PATH', 'Server/servertest_SandboxVars.lua')
  form.value.playerAuthEnabled = value(values, 'PZ_PLAYER_AUTH_ENABLED') === 'true'
  form.value.playerFtpHost = value(values, 'PZ_PLAYER_DB_FTP_HOST')
  form.value.playerFtpPort = value(values, 'PZ_PLAYER_DB_FTP_PORT')
  form.value.playerFtpUser = value(values, 'PZ_PLAYER_DB_FTP_USER')
  form.value.playerFtpSecure = value(values, 'PZ_PLAYER_DB_FTP_SECURE')
  form.value.playerDbPath = value(values, 'PZ_PLAYER_DB_FTP_PATH', 'db/servertest.db')
  form.value.playerDbWorld = value(values, 'PZ_PLAYER_DB_WORLD', 'servertest')
  form.value.brandName = value(values, 'PZ_BRAND_NAME')
  form.value.brandInitials = value(values, 'PZ_BRAND_INITIALS')
  form.value.brandTagline = value(values, 'PZ_BRAND_TAGLINE')
  form.value.portalTitle = value(values, 'PZ_PORTAL_TITLE')
  form.value.portalDescription = value(values, 'PZ_PORTAL_DESCRIPTION')
  form.value.joinAddress = value(values, 'PZ_PLAYER_JOIN_ADDRESS')
  form.value.discordUrl = value(values, 'PZ_PLAYER_DISCORD_URL')
  form.value.rulesUrl = value(values, 'PZ_PLAYER_RULES_URL')
  form.value.modsUrl = value(values, 'PZ_PLAYER_MODS_URL')
  form.value.restartSchedule = value(values, 'PZ_PLAYER_RESTART_SCHEDULE')
  form.value.announcement = value(values, 'PZ_PLAYER_ANNOUNCEMENT')
  form.value.providerName = value(values, 'PZ_PROVIDER_NAME')
  form.value.providerUrl = value(values, 'PZ_PROVIDER_URL')
  form.value.adminPublicUrl = value(values, 'PZ_ADMIN_PUBLIC_URL')
  saved.value = state.restartScheduled
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch('/api/admin/configuration', { credentials: 'same-origin', cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Configuration could not be loaded')
    hydrate(result as ConfigurationState)
    loaded.value = true
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Configuration could not be loaded'
  } finally {
    loading.value = false
  }
}

async function waitForRestart() {
  await new Promise((resolve) => window.setTimeout(resolve, 1_500))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('/api/setup/status', { cache: 'no-store' })
      const status = await response.json() as SetupStatus
      if (response.ok && status.configured && !status.restartRequired) {
        restartMessage.value = 'Dashboard restarted with the updated configuration. Reconnecting…'
        window.location.assign(STAFF_CONSOLE_PATH)
        return
      }
    } catch {
      // The dashboard is expected to be briefly unreachable during restart.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500))
  }
  restartMessage.value = `The encrypted update is saved, but the service did not return. Restart the container or service manually, then reopen ${STAFF_CONSOLE_PATH}.`
}

async function save() {
  error.value = ''
  if (form.value.dashboardPassword !== form.value.dashboardPasswordConfirm) {
    error.value = 'Dashboard passwords do not match.'
    return
  }
  if (!secretsConfigured.value.DASHBOARD_PASSWORD && form.value.dashboardPassword.length < 16) {
    error.value = 'Enter the dashboard password because it is not present in the encrypted configuration.'
    return
  }
  if (!secretsConfigured.value.PZ_RCON_PASSWORD && !form.value.rconPassword) {
    error.value = 'Enter the RCON password because it is not present in the encrypted configuration.'
    return
  }
  if ((secretsConfigured.value.PZ_DISCORD_MOD_WEBHOOK_URL || form.value.discordModWebhookUrl) && !form.value.adminPublicUrl.trim()) {
    error.value = 'Enter the public Admin URL so Discord can link to each request.'
    return
  }

  const config: Record<string, string> = {
    DASHBOARD_SECURE_COOKIE: String(form.value.secureCookie),
    PZ_RCON_HOST: form.value.rconHost,
    PZ_RCON_PORT: form.value.rconPort,
    PZ_RCON_POLL_SECONDS: form.value.rconPollSeconds,
    PZ_CONFIG_PATH: form.value.configPath,
    PZ_SANDBOX_PATH: form.value.sandboxPath,
    PZ_TELEMETRY_FTP_HOST: form.value.telemetryHost,
    PZ_TELEMETRY_FTP_PORT: form.value.telemetryPort,
    PZ_TELEMETRY_FTP_USER: form.value.telemetryUser,
    PZ_TELEMETRY_FTP_SECURE: form.value.telemetrySecure,
    PZ_TELEMETRY_FTP_PATH: form.value.telemetryPath,
    PZ_TELEMETRY_FTP_POLL_SECONDS: form.value.telemetryPollSeconds,
    PZ_CONFIG_FTP_PATH: form.value.configFtpPath,
    PZ_SANDBOX_FTP_PATH: form.value.sandboxFtpPath,
    PZ_PLAYER_AUTH_ENABLED: String(form.value.playerAuthEnabled),
    PZ_PLAYER_DB_FTP_HOST: form.value.playerFtpHost,
    PZ_PLAYER_DB_FTP_PORT: form.value.playerFtpPort,
    PZ_PLAYER_DB_FTP_USER: form.value.playerFtpUser,
    PZ_PLAYER_DB_FTP_SECURE: form.value.playerFtpSecure,
    PZ_PLAYER_DB_FTP_PATH: form.value.playerDbPath,
    PZ_PLAYER_DB_WORLD: form.value.playerDbWorld,
    PZ_BRAND_NAME: form.value.brandName,
    PZ_BRAND_INITIALS: form.value.brandInitials,
    PZ_BRAND_TAGLINE: form.value.brandTagline,
    PZ_PORTAL_TITLE: form.value.portalTitle,
    PZ_PORTAL_DESCRIPTION: form.value.portalDescription,
    PZ_PLAYER_JOIN_ADDRESS: form.value.joinAddress,
    PZ_PLAYER_DISCORD_URL: form.value.discordUrl,
    PZ_PLAYER_RULES_URL: form.value.rulesUrl,
    PZ_PLAYER_MODS_URL: form.value.modsUrl,
    PZ_PLAYER_RESTART_SCHEDULE: form.value.restartSchedule,
    PZ_PLAYER_ANNOUNCEMENT: form.value.announcement,
    PZ_PROVIDER_NAME: form.value.providerName,
    PZ_PROVIDER_URL: form.value.providerUrl,
    PZ_ADMIN_PUBLIC_URL: form.value.adminPublicUrl,
  }
  if (form.value.dashboardPassword) config.DASHBOARD_PASSWORD = form.value.dashboardPassword
  if (form.value.dashboardSessionSecret) config.DASHBOARD_SESSION_SECRET = form.value.dashboardSessionSecret
  if (form.value.rconPassword) config.PZ_RCON_PASSWORD = form.value.rconPassword
  if (form.value.telemetryToken) config.PZ_TELEMETRY_TOKEN = form.value.telemetryToken
  if (form.value.telemetryPassword) config.PZ_TELEMETRY_FTP_PASSWORD = form.value.telemetryPassword
  if (form.value.playerSessionSecret) config.PZ_PLAYER_SESSION_SECRET = form.value.playerSessionSecret
  if (form.value.playerFtpPassword) config.PZ_PLAYER_DB_FTP_PASSWORD = form.value.playerFtpPassword
  if (form.value.discordModWebhookUrl) config.PZ_DISCORD_MOD_WEBHOOK_URL = form.value.discordModWebhookUrl

  busy.value = true
  try {
    const response = await fetch('/api/admin/configuration', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, clearSecrets: clearSecrets.value }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Configuration could not be saved')
    saved.value = true
    form.value.dashboardPassword = ''
    form.value.dashboardPasswordConfirm = ''
    form.value.dashboardSessionSecret = ''
    form.value.rconPassword = ''
    form.value.telemetryToken = ''
    form.value.telemetryPassword = ''
    form.value.playerSessionSecret = ''
    form.value.playerFtpPassword = ''
    form.value.discordModWebhookUrl = ''
    void waitForRestart()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Configuration could not be saved'
  } finally {
    busy.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="section-intro">
    <div><p class="eyebrow">Encrypted operator settings</p><h2>Dashboard configuration</h2><p>Correct RCON, telemetry, file-access, sign-in, and community settings. Stored secrets are never returned to this page.</p></div>
    <span class="source-badge live">ADMIN ONLY</span>
  </div>

  <article class="panel configuration-editor">
    <div v-if="loading" class="configuration-message">Loading encrypted configuration metadata…</div>
    <div v-else-if="saved" class="configuration-message restart" role="status"><strong>Configuration saved.</strong><p>{{ restartMessage }}</p></div>
    <div v-else-if="!loaded" class="configuration-message" role="alert"><strong>Configuration unavailable.</strong><p>{{ error }}</p><button class="button outline" type="button" @click="load">Try loading again</button></div>
    <form v-else @submit.prevent="save">
      <p class="configuration-note">Blank secret fields keep their current encrypted value. Non-secret optional fields are cleared when left blank. Deployment environment variables still take precedence over the encrypted store.</p>

      <fieldset>
        <legend>Dashboard security</legend>
        <label>New administrator password <small>{{ configuredHint('DASHBOARD_PASSWORD') }}</small><input v-model="form.dashboardPassword" type="password" autocomplete="new-password" minlength="16" :required="!secretsConfigured.DASHBOARD_PASSWORD" /></label>
        <label>Confirm new password<input v-model="form.dashboardPasswordConfirm" type="password" autocomplete="new-password" minlength="16" :required="Boolean(form.dashboardPassword)" /></label>
        <label class="wide">New session signing secret <small>{{ configuredHint('DASHBOARD_SESSION_SECRET') }}</small><input v-model="form.dashboardSessionSecret" type="password" autocomplete="new-password" minlength="32" :disabled="clearSecrets.includes('DASHBOARD_SESSION_SECRET')" /></label>
        <label class="check wide"><input v-model="clearSecrets" type="checkbox" value="DASHBOARD_SESSION_SECRET" /> Rotate the dashboard session secret automatically</label>
        <label class="check wide"><input v-model="form.secureCookie" type="checkbox" /> Dashboard is served through HTTPS</label>
      </fieldset>

      <fieldset>
        <legend>Discord moderator notifications</legend>
        <label class="wide">Public Admin URL <small>Required with a webhook to build request links, for example https://pz.example.com.</small><input v-model="form.adminPublicUrl" type="url" placeholder="https://pz.example.com" :required="secretsConfigured.PZ_DISCORD_MOD_WEBHOOK_URL || Boolean(form.discordModWebhookUrl)" /></label>
        <label class="wide">New channel webhook URL <small>{{ configuredHint('PZ_DISCORD_MOD_WEBHOOK_URL', 'Enter a replacement or leave blank to keep notifications active.') }}</small><input v-model="form.discordModWebhookUrl" type="password" autocomplete="new-password" :disabled="clearSecrets.includes('PZ_DISCORD_MOD_WEBHOOK_URL')" /></label>
        <label class="check wide"><input v-model="clearSecrets" type="checkbox" value="PZ_DISCORD_MOD_WEBHOOK_URL" /> Disable Discord moderator notifications and remove the stored webhook</label>
        <p class="configuration-note wide">This sends only new Request Center activity, staff request actions, and successful kick, ban, or whitelist-removal actions. It does not mirror the administrator audit log. Webhook messages suppress all Discord mentions.</p>
      </fieldset>

      <fieldset>
        <legend>Project Zomboid RCON</legend>
        <label>RCON host<input v-model="form.rconHost" autocomplete="off" required /></label>
        <label>RCON port<input v-model="form.rconPort" type="number" min="1" max="65535" required /></label>
        <label class="wide">New RCON password <small>{{ configuredHint('PZ_RCON_PASSWORD') }}</small><input v-model="form.rconPassword" type="password" autocomplete="new-password" :required="!secretsConfigured.PZ_RCON_PASSWORD" /></label>
        <label>RCON poll interval (seconds)<input v-model="form.rconPollSeconds" type="number" min="5" required /></label>
        <label>Local servertest.ini path <small>Optional container path; overrides FTP.</small><input v-model="form.configPath" autocomplete="off" /></label>
        <label>Local SandboxVars.lua path <small>Optional container path; overrides FTP.</small><input v-model="form.sandboxPath" autocomplete="off" /></label>
      </fieldset>

      <fieldset>
        <legend>Telemetry and server-file access</legend>
        <label>FTP/FTPS host<input v-model="form.telemetryHost" autocomplete="off" /></label>
        <label>Port<input v-model="form.telemetryPort" type="number" min="1" max="65535" /></label>
        <label>Username<input v-model="form.telemetryUser" autocomplete="username" /></label>
        <label>Password <small>{{ configuredHint('PZ_TELEMETRY_FTP_PASSWORD') }}</small><input v-model="form.telemetryPassword" type="password" autocomplete="new-password" :disabled="clearSecrets.includes('PZ_TELEMETRY_FTP_PASSWORD')" /></label>
        <label class="check"><input v-model="clearSecrets" type="checkbox" value="PZ_TELEMETRY_FTP_PASSWORD" /> Remove stored FTP password</label>
        <label>Transport<select v-model="form.telemetrySecure"><option value="false">Plain FTP</option><option value="true">Explicit FTPS</option><option value="implicit">Implicit FTPS</option></select></label>
        <label>Telemetry file path<input v-model="form.telemetryPath" autocomplete="off" /></label>
        <label>Telemetry poll interval (seconds)<input v-model="form.telemetryPollSeconds" type="number" min="5" /></label>
        <label>Server INI FTP path <small>Refreshed automatically.</small><input v-model="form.configFtpPath" autocomplete="off" /></label>
        <label>SandboxVars FTP path <small>Refreshed automatically.</small><input v-model="form.sandboxFtpPath" autocomplete="off" /></label>
        <label class="wide">New telemetry HTTP token <small>{{ configuredHint('PZ_TELEMETRY_TOKEN') }}</small><input v-model="form.telemetryToken" type="password" autocomplete="new-password" :disabled="clearSecrets.includes('PZ_TELEMETRY_TOKEN')" /></label>
        <label class="check wide"><input v-model="clearSecrets" type="checkbox" value="PZ_TELEMETRY_TOKEN" /> Remove stored HTTP token</label>
        <label class="check wide"><input v-model="form.playerAuthEnabled" type="checkbox" /> Enable player account sign-in</label>
        <template v-if="form.playerAuthEnabled">
          <label>New player session secret <small>{{ configuredHint('PZ_PLAYER_SESSION_SECRET') }}</small><input v-model="form.playerSessionSecret" type="password" autocomplete="new-password" minlength="32" :disabled="clearSecrets.includes('PZ_PLAYER_SESSION_SECRET')" /></label>
          <label class="check"><input v-model="clearSecrets" type="checkbox" value="PZ_PLAYER_SESSION_SECRET" /> Rotate automatically</label>
          <label class="wide"><small>Leave separate connection fields blank to reuse the telemetry FTP/FTPS credentials.</small></label>
          <label>Separate FTP/FTPS host<input v-model="form.playerFtpHost" autocomplete="off" /></label>
          <label>Separate port<input v-model="form.playerFtpPort" type="number" min="1" max="65535" /></label>
          <label>Separate username<input v-model="form.playerFtpUser" autocomplete="username" /></label>
          <label>Separate password <small>{{ configuredHint('PZ_PLAYER_DB_FTP_PASSWORD') }}</small><input v-model="form.playerFtpPassword" type="password" autocomplete="new-password" :disabled="clearSecrets.includes('PZ_PLAYER_DB_FTP_PASSWORD')" /></label>
          <label class="check"><input v-model="clearSecrets" type="checkbox" value="PZ_PLAYER_DB_FTP_PASSWORD" /> Remove separate password</label>
          <label>Separate transport<select v-model="form.playerFtpSecure"><option value="">Reuse telemetry setting</option><option value="false">Plain FTP</option><option value="true">Explicit FTPS</option><option value="implicit">Implicit FTPS</option></select></label>
          <label>Account database path<input v-model="form.playerDbPath" autocomplete="off" /></label>
          <label>World name<input v-model="form.playerDbWorld" autocomplete="off" /></label>
        </template>
      </fieldset>

      <fieldset>
        <legend>Community identity</legend>
        <label>Community name<input v-model="form.brandName" maxlength="80" /></label>
        <label>Initials<input v-model="form.brandInitials" maxlength="4" /></label>
        <label class="wide">Tagline<input v-model="form.brandTagline" maxlength="100" /></label>
        <label>Portal title<input v-model="form.portalTitle" maxlength="100" /></label>
        <label>Join address<input v-model="form.joinAddress" maxlength="160" /></label>
        <label class="wide">Portal description<textarea v-model="form.portalDescription" rows="3" maxlength="320"></textarea></label>
        <label>Discord URL<input v-model="form.discordUrl" type="url" /></label>
        <label>Rules URL<input v-model="form.rulesUrl" type="url" /></label>
        <label>Mod collection URL<input v-model="form.modsUrl" type="url" /></label>
        <label>Restart schedule<input v-model="form.restartSchedule" maxlength="120" /></label>
        <label class="wide">Community announcement<textarea v-model="form.announcement" rows="3" maxlength="500"></textarea></label>
        <label>Provider name<input v-model="form.providerName" maxlength="80" /></label>
        <label>Provider panel URL<input v-model="form.providerUrl" type="url" /></label>
      </fieldset>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="configuration-actions"><button class="button primary" type="submit" :disabled="busy">{{ busy ? 'Encrypting update…' : 'Save settings and restart' }}</button><small>The container should be unavailable briefly while its restart policy relaunches it.</small></div>
    </form>
  </article>
</template>

<style scoped>
.configuration-editor { padding: clamp(18px, 3vw, 30px); }
.configuration-editor form { display: grid; gap: 22px; }
.configuration-note { margin: 0; padding: 14px 16px; border-left: 3px solid var(--acid); background: rgba(167, 180, 106, .08); color: var(--muted); line-height: 1.55; }
fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 20px; border: 1px solid var(--line-soft); }
legend { padding: 0 8px; color: var(--acid-bright); font: 700 14px 'Barlow Condensed'; letter-spacing: .08em; text-transform: uppercase; }
label { display: grid; gap: 7px; color: var(--text); font-size: 13px; font-weight: 700; }
label small { color: var(--muted); font-weight: 400; line-height: 1.4; }
label.wide { grid-column: 1 / -1; }
input, select, textarea { width: 100%; padding: 12px 13px; border: 1px solid var(--line); background: var(--surface-deep); color: var(--text); }
input:disabled { opacity: .55; }
textarea { resize: vertical; }
.check { grid-template-columns: auto 1fr; align-items: center; justify-content: start; color: var(--muted-2); }
.check input { width: auto; }
.configuration-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.configuration-actions small { color: var(--muted); }
.configuration-message { padding: 26px; color: var(--muted); text-align: center; }
.configuration-message.restart { border: 1px solid var(--acid); background: rgba(167, 180, 106, .08); text-align: left; }
.configuration-message strong { color: var(--acid-bright); font-size: 18px; }
.configuration-message p { margin-bottom: 0; }
@media (max-width: 760px) { fieldset { grid-template-columns: 1fr; } label.wide { grid-column: auto; } }
</style>
