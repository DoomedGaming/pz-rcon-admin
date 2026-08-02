import { createDashboardServer } from './app.js'
import { appConfig } from './config.js'

const { app, poll, rcon, telemetryBridge, serverConfigBridge, playerCredentialVerifier, setupRequired, initialSetupToken } = createDashboardServer({
  requestRestart() {
    console.log('Secure configuration changed. Exiting so the process supervisor can restart PZ RCON Admin.')
    stopTimers()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5_000).unref()
  },
})

const server = app.listen(appConfig.port, appConfig.host, () => {
  console.log(`Project Zomboid Admin API listening on http://${appConfig.host}:${appConfig.port}`)
  console.log(`RCON mode: ${rcon.getState().mode}`)
  console.log(`Telemetry mode: ${telemetryBridge.getState().configured ? 'FTP bridge' : appConfig.telemetryToken ? 'HTTP receiver' : 'disabled'}`)
  console.log(`Player portal: ${playerCredentialVerifier.configured ? 'enabled' : 'disabled'}`)
  if (!setupRequired) {
    for (const warning of appConfig.securityWarnings) console.warn(`Security warning: ${warning}`)
  }
  if (playerCredentialVerifier.configured && !appConfig.secureCookie) {
    console.warn('Player portal cookies are not marked Secure; keep this instance on localhost or behind a correctly configured HTTPS deployment.')
  }
  if (initialSetupToken) {
    const browserHost = ['0.0.0.0', '::'].includes(appConfig.host) ? '127.0.0.1' : appConfig.host
    const setupBaseUrl = process.env.PZ_SETUP_PUBLIC_URL?.trim()
      || (appConfig.production ? `http://${browserHost}:${appConfig.port}` : 'http://127.0.0.1:5173')
    console.log(`One-time secure setup: ${setupBaseUrl.replace(/\/$/, '')}/setup?token=${initialSetupToken}`)
    console.log('The setup token is valid only until configuration is saved or the process restarts.')
  }
})

void poll()
const pollTimer = setInterval(() => void poll(), appConfig.rcon.pollSeconds * 1000)
pollTimer.unref()

const telemetryFtpConfigured = telemetryBridge.getState().configured
const serverConfigFtpConfigured = serverConfigBridge.getState().configured
if (telemetryFtpConfigured) void telemetryBridge.poll()
if (serverConfigFtpConfigured) void serverConfigBridge.poll()
const telemetryFtpPollTimer = telemetryFtpConfigured
  ? setInterval(() => void telemetryBridge.poll(), appConfig.telemetryFtp.pollSeconds * 1000)
  : undefined
const serverConfigFtpPollTimer = serverConfigFtpConfigured
  ? setInterval(() => void serverConfigBridge.poll(), appConfig.serverConfigFtp.pollSeconds * 1000)
  : undefined
telemetryFtpPollTimer?.unref()
serverConfigFtpPollTimer?.unref()

function stopTimers() {
  clearInterval(pollTimer)
  if (telemetryFtpPollTimer) clearInterval(telemetryFtpPollTimer)
  if (serverConfigFtpPollTimer) clearInterval(serverConfigFtpPollTimer)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopTimers()
    server.close(() => process.exit(0))
  })
}
