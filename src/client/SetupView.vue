<script setup lang="ts">
import { ref } from 'vue'
import type { SetupStatus } from '@shared/types'

defineProps<{ status: SetupStatus }>()

const url = new URL(window.location.href)
const token = ref(url.searchParams.get('token') ?? '')
if (url.searchParams.has('token')) {
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
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
  telemetryPath: 'Lua/PZRconAdminTelemetry/players.json',
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
})
const busy = ref(false)
const saved = ref(false)
const error = ref('')
const restartMessage = ref('Waiting for the dashboard service to restart…')

async function waitForRestart() {
  await new Promise((resolve) => window.setTimeout(resolve, 1_500))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('/api/setup/status', { cache: 'no-store' })
      const nextStatus = await response.json() as SetupStatus
      if (response.ok && nextStatus.configured && !nextStatus.restartRequired) {
        restartMessage.value = 'Dashboard restarted. Opening the admin console…'
        window.location.assign('/admin')
        return
      }
    } catch {
      // A connection failure is expected while the container is restarting.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500))
  }
  restartMessage.value = 'The configuration is saved, but the service did not return automatically. Restart the container or service, then open /admin.'
}

async function save() {
  error.value = ''
  if (form.value.dashboardPassword !== form.value.dashboardPasswordConfirm) {
    error.value = 'Dashboard passwords do not match.'
    return
  }
  busy.value = true
  try {
    const response = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.value,
        config: {
          DASHBOARD_PASSWORD: form.value.dashboardPassword,
          DASHBOARD_SESSION_SECRET: form.value.dashboardSessionSecret,
          DASHBOARD_SECURE_COOKIE: String(form.value.secureCookie),
          PZ_RCON_HOST: form.value.rconHost,
          PZ_RCON_PORT: form.value.rconPort,
          PZ_RCON_PASSWORD: form.value.rconPassword,
          PZ_RCON_POLL_SECONDS: form.value.rconPollSeconds,
          PZ_CONFIG_PATH: form.value.configPath,
          PZ_SANDBOX_PATH: form.value.sandboxPath,
          PZ_TELEMETRY_TOKEN: form.value.telemetryToken,
          PZ_TELEMETRY_FTP_HOST: form.value.telemetryHost,
          PZ_TELEMETRY_FTP_PORT: form.value.telemetryPort,
          PZ_TELEMETRY_FTP_USER: form.value.telemetryUser,
          PZ_TELEMETRY_FTP_PASSWORD: form.value.telemetryPassword,
          PZ_TELEMETRY_FTP_SECURE: form.value.telemetrySecure,
          PZ_TELEMETRY_FTP_PATH: form.value.telemetryPath,
          PZ_TELEMETRY_FTP_POLL_SECONDS: form.value.telemetryPollSeconds,
          PZ_CONFIG_FTP_PATH: form.value.configFtpPath,
          PZ_SANDBOX_FTP_PATH: form.value.sandboxFtpPath,
          PZ_PLAYER_AUTH_ENABLED: String(form.value.playerAuthEnabled),
          PZ_PLAYER_SESSION_SECRET: form.value.playerSessionSecret,
          PZ_PLAYER_DB_FTP_HOST: form.value.playerFtpHost,
          PZ_PLAYER_DB_FTP_PORT: form.value.playerFtpPort,
          PZ_PLAYER_DB_FTP_USER: form.value.playerFtpUser,
          PZ_PLAYER_DB_FTP_PASSWORD: form.value.playerFtpPassword,
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
          PZ_DISCORD_MOD_WEBHOOK_URL: form.value.discordModWebhookUrl,
        },
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Secure configuration could not be saved')
    saved.value = true
    form.value.dashboardPassword = ''
    form.value.dashboardPasswordConfirm = ''
    form.value.dashboardSessionSecret = ''
    form.value.rconPassword = ''
    form.value.telemetryPassword = ''
    form.value.playerSessionSecret = ''
    form.value.playerFtpPassword = ''
    form.value.telemetryToken = ''
    form.value.discordModWebhookUrl = ''
    token.value = ''
    void waitForRestart()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Secure configuration could not be saved'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="setup-shell">
    <section class="setup-card">
      <header>
        <span class="setup-mark">PZ</span>
        <div><p class="eyebrow">One-time local setup</p><h1>Secure configuration</h1></div>
      </header>

      <div v-if="saved || status.restartRequired" class="setup-result" role="status">
        <strong>Encrypted configuration saved.</strong>
        <p>{{ saved ? restartMessage : 'A restart is already in progress. This page will be available again after the dashboard returns.' }}</p>
      </div>

      <div v-else-if="!status.available" class="setup-result">
        <strong>Secure configuration already exists.</strong>
        <p>This first-run form is locked. Restart normally or use the documented local migration command to replace the encrypted store intentionally.</p>
      </div>

      <form v-else @submit.prevent="save">
        <p class="setup-intro">Paste the one-time token printed in the server terminal. Passwords and connection credentials are encrypted on the server with an owner-only key; they are never echoed back after saving.</p>

        <fieldset>
          <legend>Setup access</legend>
          <label class="wide">One-time setup token<input v-model="token" type="password" autocomplete="one-time-code" required /></label>
        </fieldset>

        <fieldset>
          <legend>Discord moderator notifications</legend>
          <label class="wide">Channel webhook URL <small>Optional secret. Sends Request Center activity and successful kick, ban, or whitelist-removal actions only; it never mirrors the full audit log.</small><input v-model="form.discordModWebhookUrl" type="password" autocomplete="new-password" /></label>
        </fieldset>

        <fieldset>
          <legend>Dashboard security</legend>
          <label>Administrator password<input v-model="form.dashboardPassword" type="password" autocomplete="new-password" minlength="16" required /></label>
          <label>Confirm administrator password<input v-model="form.dashboardPasswordConfirm" type="password" autocomplete="new-password" minlength="16" required /></label>
          <label class="wide">Session signing secret <small>Leave blank to generate a strong random value.</small><input v-model="form.dashboardSessionSecret" type="password" autocomplete="new-password" minlength="32" /></label>
          <label class="check wide"><input v-model="form.secureCookie" type="checkbox" /> Dashboard is served through HTTPS</label>
        </fieldset>

        <fieldset>
          <legend>Project Zomboid RCON</legend>
          <label>RCON host<input v-model="form.rconHost" autocomplete="off" required placeholder="server.example.com" /></label>
          <label>RCON port<input v-model="form.rconPort" type="number" min="1" max="65535" required /></label>
          <label class="wide">RCON password<input v-model="form.rconPassword" type="password" autocomplete="new-password" required /></label>
          <label>RCON poll interval (seconds)<input v-model="form.rconPollSeconds" type="number" min="5" required /></label>
          <label>Local servertest.ini path <small>Optional container path; overrides FTP.</small><input v-model="form.configPath" autocomplete="off" /></label>
          <label>Local SandboxVars.lua path <small>Optional container path; overrides FTP.</small><input v-model="form.sandboxPath" autocomplete="off" /></label>
        </fieldset>

        <fieldset>
          <legend>Optional server-file access</legend>
          <label>FTP/FTPS host<input v-model="form.telemetryHost" autocomplete="off" /></label>
          <label>Port<input v-model="form.telemetryPort" type="number" min="1" max="65535" /></label>
          <label>Username<input v-model="form.telemetryUser" autocomplete="username" /></label>
          <label>Password<input v-model="form.telemetryPassword" type="password" autocomplete="new-password" /></label>
          <label>Transport<select v-model="form.telemetrySecure"><option value="false">Plain FTP</option><option value="true">Explicit FTPS</option><option value="implicit">Implicit FTPS</option></select></label>
          <label>Telemetry file path<input v-model="form.telemetryPath" autocomplete="off" /></label>
          <label>Telemetry poll interval (seconds)<input v-model="form.telemetryPollSeconds" type="number" min="5" /></label>
          <label>Server INI FTP path <small>Refreshed automatically.</small><input v-model="form.configFtpPath" autocomplete="off" /></label>
          <label>SandboxVars FTP path <small>Refreshed automatically.</small><input v-model="form.sandboxFtpPath" autocomplete="off" /></label>
          <label class="wide">Telemetry HTTP token <small>Optional secret for custom authenticated senders.</small><input v-model="form.telemetryToken" type="password" autocomplete="new-password" /></label>
          <label class="check"><input v-model="form.playerAuthEnabled" type="checkbox" /> Enable player account sign-in</label>
          <template v-if="form.playerAuthEnabled">
            <label>Player session secret <small>Leave blank to generate.</small><input v-model="form.playerSessionSecret" type="password" autocomplete="new-password" minlength="32" /></label>
            <label class="wide"><small>Leave the fields below blank to reuse the telemetry file credentials.</small></label>
            <label>Separate FTP/FTPS host<input v-model="form.playerFtpHost" autocomplete="off" /></label>
            <label>Separate port<input v-model="form.playerFtpPort" type="number" min="1" max="65535" /></label>
            <label>Separate username<input v-model="form.playerFtpUser" autocomplete="username" /></label>
            <label>Separate password<input v-model="form.playerFtpPassword" type="password" autocomplete="new-password" /></label>
            <label>Separate transport<select v-model="form.playerFtpSecure"><option value="">Reuse telemetry setting</option><option value="false">Plain FTP</option><option value="true">Explicit FTPS</option><option value="implicit">Implicit FTPS</option></select></label>
            <label>Account database path<input v-model="form.playerDbPath" autocomplete="off" /></label>
            <label>World name<input v-model="form.playerDbWorld" autocomplete="off" /></label>
          </template>
        </fieldset>

        <fieldset>
          <legend>Community identity</legend>
          <label>Community name<input v-model="form.brandName" maxlength="80" placeholder="Defaults to the server PublicName" /></label>
          <label>Initials<input v-model="form.brandInitials" maxlength="4" placeholder="Auto" /></label>
          <label class="wide">Tagline<input v-model="form.brandTagline" maxlength="100" placeholder="Survivor network" /></label>
          <label>Portal title<input v-model="form.portalTitle" maxlength="100" placeholder="Your life. Your record." /></label>
          <label>Join address<input v-model="form.joinAddress" maxlength="160" placeholder="pz.example.com:16261" /></label>
          <label class="wide">Portal description<textarea v-model="form.portalDescription" rows="3" maxlength="320"></textarea></label>
          <label>Discord URL<input v-model="form.discordUrl" type="url" /></label>
          <label>Rules URL<input v-model="form.rulesUrl" type="url" /></label>
          <label>Mod collection URL<input v-model="form.modsUrl" type="url" /></label>
          <label>Restart schedule<input v-model="form.restartSchedule" maxlength="120" /></label>
          <label class="wide">Community announcement<textarea v-model="form.announcement" rows="3" maxlength="500"></textarea></label>
          <label>Provider name<input v-model="form.providerName" maxlength="80" /></label>
          <label>Provider panel URL<input v-model="form.providerUrl" type="url" /></label>
        </fieldset>

        <p v-if="error" class="setup-error" role="alert">{{ error }}</p>
        <button class="button primary" type="submit" :disabled="busy">{{ busy ? 'Encrypting configuration…' : 'Save encrypted configuration' }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.setup-shell { min-height: 100vh; padding: 40px 20px; background: radial-gradient(circle at top right, rgba(167,180,106,.1), transparent 32%), var(--bg); color: var(--text); }
.setup-card { width: min(920px, 100%); margin: 0 auto; padding: clamp(24px, 5vw, 52px); border: 1px solid var(--line); background: var(--panel); box-shadow: 0 28px 80px rgba(0,0,0,.35); }
header { display: flex; gap: 18px; align-items: center; margin-bottom: 28px; }
.setup-mark { width: 54px; height: 54px; display: grid; place-items: center; background: var(--acid); color: var(--accent-ink); font: 700 20px 'Barlow Condensed'; }
h1 { margin: 2px 0 0; font: 700 clamp(34px, 6vw, 58px)/.9 'Barlow Condensed'; text-transform: uppercase; }
.setup-intro { max-width: 760px; color: var(--muted); line-height: 1.65; }
form { display: grid; gap: 20px; }
fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 20px; border: 1px solid var(--line-soft); }
legend { padding: 0 8px; color: var(--acid-bright); font: 700 14px 'Barlow Condensed'; letter-spacing: .08em; text-transform: uppercase; }
label { display: grid; gap: 7px; color: var(--text); font-size: 13px; font-weight: 700; }
label small { color: var(--muted); font-weight: 400; }
label.wide { grid-column: 1 / -1; }
input, select, textarea { width: 100%; padding: 12px 13px; border: 1px solid var(--line); background: var(--surface-deep); color: var(--text); }
textarea { resize: vertical; }
.check { grid-template-columns: auto 1fr; align-items: center; justify-content: start; }
.check input { width: auto; }
.setup-error { padding: 12px 14px; border: 1px solid var(--red); color: #ef7770; background: rgba(187,73,66,.08); }
.setup-result { padding: 22px; border: 1px solid var(--acid); background: rgba(167,180,106,.08); }
.setup-result strong { color: var(--acid-bright); font-size: 18px; }
.setup-result p { margin-bottom: 0; color: var(--muted); line-height: 1.6; }
@media (max-width: 700px) { fieldset { grid-template-columns: 1fr; } label.wide { grid-column: auto; } }
</style>
