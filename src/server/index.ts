import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type Request, type Response } from 'express'
import type { DashboardRole, Overview, PlayerPortalLanding, PlayerPortalOverview, PlayerTelemetry, SandboxSettingsSnapshot } from '../shared/types.js'
import { isSupportRequestStatus, normalizeSupportRequestInput, normalizeSupportRequestMessage } from '../shared/support-requests.js'
import { isValidWorldMapTile, worldMapUpstreamTileUrl } from '../shared/world-map.js'
import { createAuth, createPlayerAuth } from './auth.js'
import { appConfig } from './config.js'
import { buildDefinedCommand, buildPlayerCommand, buildPlayerTeleportToPositionCommand, commandDefinitions, isModeratorPlayerAction, validateDefinedCommandOutput, validateModerationReason, validatePlayerActionOutput, validateRawCommand, type PlayerAction } from './commands.js'
import { parseSandboxLua, summarizeConfig } from './ini.js'
import { LiveSettingsService, validateLiveSettingOutput } from './live-settings.js'
import { isPlayerTheme } from '../shared/player-settings.js'
import { PzPlayerCredentialVerifier } from './player-auth.js'
import { buildPlayerMapRoster, buildPlayerPortalCommunity } from './player-portal.js'
import { PzRconService } from './rcon.js'
import { DashboardStore } from './store.js'
import { editableSecureConfigState, updateEditableSecureConfig } from './configuration-editor.js'
import { buildInitialSecureConfig, loadSecureConfig, saveSecureConfig } from './secure-config.js'
import { normalizePlayerTelemetry, TelemetryFtpBridge } from './telemetry.js'
import { ServerConfigFtpBridge } from './server-config-ftp.js'
import { normalizeSandboxValue, SandboxControlBridge, sandboxSettingsFromValues } from './sandbox-control.js'
import { DiscordModerationNotifier, type ModerationNotification } from './discord-moderation.js'

const app = express()
const store = new DashboardStore(appConfig.dataPath)
const rcon = new PzRconService(appConfig.rcon)
const auth = createAuth(appConfig.dashboardPassword, appConfig.sessionSecret, appConfig.secureCookie)
const playerAuth = createPlayerAuth(appConfig.playerSessionSecret, appConfig.secureCookie)
const playerCredentialVerifier = new PzPlayerCredentialVerifier(appConfig.playerAuth)
const liveSettings = new LiveSettingsService(appConfig.configSummary.values, store.getLiveSettingOverrides())
const discordModeration = new DiscordModerationNotifier(appConfig.discordModerationWebhookUrl, appConfig.adminPublicUrl)
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const playerLoginAttempts = new Map<string, { count: number; resetAt: number }>()
let availableGameRoles: string[] = []
const telemetryBridge = new TelemetryFtpBridge(appConfig.telemetryFtp, (snapshot, observedAt) => {
  availableGameRoles = snapshot.roles
  store.updateTelemetryBatch(snapshot.players, observedAt)
})
const serverConfigBridge = new ServerConfigFtpBridge(appConfig.serverConfigFtp, (update) => {
  if (update.configValues) {
    const summary = summarizeConfig(update.configValues)
    Object.assign(appConfig.configSummary, summary)
    appConfig.playerPortal = buildPlayerPortalCommunity(process.env, summary.name)
    liveSettings.importConfigured(summary.values)
  }
  if (update.sandboxText !== undefined) appConfig.sandboxText = update.sandboxText
})
const sandboxControl = new SandboxControlBridge({
  ...appConfig.telemetryFtp,
  telemetryPath: appConfig.telemetryFtp.remotePath,
})
let setupToken = appConfig.secureConfig.configured ? '' : randomBytes(24).toString('base64url')
let setupSaved = false
let configurationRestartScheduled = false
const setupRequired = !appConfig.secureConfig.configured && !(
  appConfig.dashboardPassword
  && appConfig.rcon.host
  && appConfig.rcon.port
  && appConfig.rcon.password
)

const roleRank: Record<DashboardRole, number> = { user: 0, moderator: 1, admin: 2 }
const TELEPORT_POSITION_MAX_AGE_MS = 15_000

function currentTeleportPosition(telemetry: PlayerTelemetry | undefined) {
  const position = telemetry?.position
  const updatedAt = telemetry?.updatedAt ? Date.parse(telemetry.updatedAt) : NaN
  if (!position || !Number.isFinite(updatedAt)) return undefined
  const age = Date.now() - updatedAt
  return age >= -5_000 && age <= TELEPORT_POSITION_MAX_AGE_MS ? position : undefined
}

function requestDashboardIdentity(request: Request): { username?: string; role: DashboardRole; method?: 'player' | 'bootstrap' } {
  if (auth.authenticated(request)) return { role: 'admin', method: 'bootstrap' }
  const username = playerAuth.username(request)
  return username
    ? { username, role: store.getDashboardRole(username), method: 'player' }
    : { role: 'user' }
}

function requireDashboardRole(required: 'moderator' | 'admin') {
  return (request: Request, response: Response, next: () => void) => {
    const identity = requestDashboardIdentity(request)
    if (roleRank[identity.role] >= roleRank[required]) return next()
    response.status(identity.username ? 403 : 401).json({ error: identity.username ? `${required === 'admin' ? 'Administrator' : 'Moderator'} access required` : 'Authentication required' })
  }
}

function dashboardActor(request: Request): string {
  return requestDashboardIdentity(request).username ?? 'Bootstrap administrator'
}

function notifyModerators(notification: ModerationNotification) {
  void discordModeration.send(notification).catch((error) => {
    console.warn(`Discord moderator notification failed: ${errorMessage(error)}`)
  })
}

function updateConfigSummary(key: string, value: boolean | number) {
  appConfig.configSummary.values[key] = value
  if (key === 'Open') appConfig.configSummary.open = Boolean(value)
  if (key === 'PVP') appConfig.configSummary.pvp = Boolean(value)
  if (key === 'PauseEmpty') appConfig.configSummary.pauseEmpty = Boolean(value)
  if (key === 'MaxPlayers') appConfig.configSummary.maxPlayers = Number(value)
  if (key === 'SaveWorldEveryMinutes') appConfig.configSummary.saveMinutes = Number(value)
}

app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (appConfig.production) {
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'")
  }
  next()
})

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error'
}

function hash(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function tokenMatches(supplied: string, expected: string): boolean {
  return Boolean(expected) && timingSafeEqual(hash(supplied), hash(expected))
}

function setupString(value: unknown, maxLength = 4_096): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function scheduleConfigurationRestart(response: Response) {
  if (configurationRestartScheduled) return
  configurationRestartScheduled = true
  let armed = false
  const beginRestart = () => {
    if (armed) return
    armed = true
    const restartTimer = setTimeout(() => {
      console.log('Secure configuration changed. Exiting so the process supervisor can restart PZ RCON Admin.')
      clearInterval(pollTimer)
      if (telemetryFtpPollTimer) clearInterval(telemetryFtpPollTimer)
      if (serverConfigFtpPollTimer) clearInterval(serverConfigFtpPollTimer)
      server.close(() => process.exit(0))
      const forceExitTimer = setTimeout(() => process.exit(0), 5_000)
      forceExitTimer.unref()
    }, 750)
    restartTimer.unref()
  }
  response.once('finish', beginRestart)
  response.once('close', beginRestart)
}

app.get('/api/setup/status', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.json({
    configured: appConfig.secureConfig.configured || setupSaved,
    available: !appConfig.secureConfig.configured && !setupSaved,
    required: setupRequired && !setupSaved,
    restartRequired: setupSaved || configurationRestartScheduled,
  })
})

app.post('/api/setup', (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  if (appConfig.secureConfig.configured || setupSaved) return response.status(409).json({ error: 'Secure configuration already exists' })
  if (!tokenMatches(setupString(request.body?.token, 128), setupToken)) {
    return response.status(403).json({ error: 'The one-time setup token is invalid' })
  }
  try {
    const config = buildInitialSecureConfig(request.body?.config)
    saveSecureConfig(config, appConfig.secureConfig.directory)
    setupSaved = true
    setupToken = ''
    scheduleConfigurationRestart(response)
    response.status(201).json({ saved: true, restartScheduled: true })
  } catch (error) {
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.use('/api', (_request, response, next) => {
  if (setupSaved) return response.status(503).json({ error: 'Secure configuration saved. Restart the dashboard to activate it.' })
  if (setupRequired) return response.status(503).json({ error: 'Initial secure setup is required' })
  next()
})

function redactCommand(command: string): string {
  if (/^adduser\b/i.test(command)) return `${command.split(/\s+/)[0]} [redacted]`
  if (/^changeoption\s+(password|rconpassword|discordtoken|webhookaddress)\b/i.test(command)) return 'changeoption [secret] [redacted]'
  return command
}

function playerPortalLanding(): PlayerPortalLanding {
  const players = store.getPlayers()
  const summary = appConfig.configSummary
  const connection = rcon.getState()
  return {
    server: {
      name: summary.name,
      connected: connection.connected,
      onlinePlayers: players.filter((player) => player.online).length,
      maxPlayers: summary.maxPlayers,
      map: summary.map,
      pvp: summary.pvp,
      public: summary.public,
      lastPollAt: connection.lastPollAt,
    },
    community: appConfig.playerPortal,
  }
}

app.get('/map-tiles/:level/:tile', async (request, response) => {
  if (!auth.authenticated(request) && !playerAuth.username(request)) {
    return response.status(401).end()
  }
  const level = Number(request.params.level)
  const match = /^(\d+)_(\d+)\.webp$/.exec(request.params.tile)
  const x = Number(match?.[1])
  const y = Number(match?.[2])
  if (!match || !isValidWorldMapTile(level, x, y)) return response.status(404).end()

  try {
    const upstream = await fetch(worldMapUpstreamTileUrl(level, x, y), {
      headers: { 'User-Agent': 'PZ-RCON-Admin/0.1 map tile gateway' },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })
    if (!upstream.ok) return response.status(upstream.status === 404 ? 404 : 502).end()

    const contentType = upstream.headers.get('content-type')?.split(';')[0]
    const contentLength = Number(upstream.headers.get('content-length') ?? 0)
    if (contentType !== 'image/webp' || contentLength > 1_048_576) return response.status(502).end()

    const body = Buffer.from(await upstream.arrayBuffer())
    if (!body.length || body.length > 1_048_576) return response.status(502).end()
    response.setHeader('Content-Type', 'image/webp')
    response.setHeader('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.send(body)
  } catch {
    response.status(502).end()
  }
})

app.get('/api/session', (request, response) => {
  const identity = requestDashboardIdentity(request)
  response.json({
    authenticated: roleRank[identity.role] >= roleRank.moderator,
    identityAuthenticated: Boolean(identity.method),
    required: auth.required || playerCredentialVerifier.configured,
    username: identity.username,
    role: identity.role,
    method: identity.method,
    community: appConfig.playerPortal,
  })
})

app.post('/api/login', (request, response) => {
  const key = request.ip || 'unknown'
  const now = Date.now()
  const attempt = loginAttempts.get(key)
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    return response.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })
  }
  if (!auth.login(String(request.body?.password ?? ''), response)) {
    loginAttempts.set(key, { count: (attempt?.resetAt ?? 0) > now ? attempt!.count + 1 : 1, resetAt: now + 5 * 60_000 })
    store.addAudit({ category: 'auth', action: 'login', success: false, detail: 'Invalid credentials' })
    return response.status(401).json({ error: 'Invalid password' })
  }
  loginAttempts.delete(key)
  store.addAudit({ category: 'auth', action: 'login', success: true })
  response.json({ ok: true })
})

app.post('/api/logout', (request, response) => {
  auth.logout(response)
  playerAuth.logout(response)
  response.json({ ok: true })
})

app.get('/api/player/session', (request, response) => {
  const username = playerAuth.username(request)
  const role = username ? store.getDashboardRole(username) : undefined
  response.json({
    authenticated: Boolean(username),
    available: playerCredentialVerifier.configured,
    username,
    role,
    canAccessAdmin: role === 'moderator' || role === 'admin',
    landing: playerPortalLanding(),
  })
})

app.post('/api/player/login', async (request, response) => {
  if (!playerCredentialVerifier.configured) {
    return response.status(503).json({ error: 'Player sign-in is not configured' })
  }

  const username = String(request.body?.username ?? '').trim().slice(0, 64)
  const password = String(request.body?.password ?? '')
  const key = `${request.ip || 'unknown'}:${username.toLocaleLowerCase('en-US')}`
  const now = Date.now()
  const attempt = playerLoginAttempts.get(key)
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    return response.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })
  }

  let canonicalUsername: string | undefined
  try {
    canonicalUsername = await playerCredentialVerifier.verify(username, password)
  } catch {
    return response.status(503).json({ error: 'Player sign-in is temporarily unavailable' })
  }

  if (!canonicalUsername) {
    playerLoginAttempts.set(key, {
      count: (attempt?.resetAt ?? 0) > now ? attempt!.count + 1 : 1,
      resetAt: now + 5 * 60_000,
    })
    store.addAudit({ category: 'auth', action: 'player-login', target: username || undefined, success: false, detail: 'Invalid credentials' })
    return response.status(401).json({ error: 'Invalid username or password' })
  }

  playerLoginAttempts.delete(key)
  const dashboardUser = store.recordDashboardLogin(canonicalUsername)
  playerAuth.login(canonicalUsername, response)
  store.addAudit({ category: 'auth', action: 'player-login', target: canonicalUsername, success: true })
  response.json({ ok: true, username: canonicalUsername, role: dashboardUser.role, canAccessAdmin: dashboardUser.role !== 'user' })
})

app.post('/api/player/logout', (_request, response) => {
  auth.logout(response)
  playerAuth.logout(response)
  response.json({ ok: true })
})

app.get('/api/player/me', (request, response) => {
  const username = playerAuth.username(request)
  if (!username) return response.status(401).json({ error: 'Player authentication required' })

  const landing = playerPortalLanding()
  const telemetryState = telemetryBridge.getState()
  const portal: PlayerPortalOverview = {
    username,
    role: store.getDashboardRole(username),
    canAccessAdmin: roleRank[store.getDashboardRole(username)] >= roleRank.moderator,
    settings: store.getPlayerSettings(username),
    player: store.getPlayer(username),
    mapPlayers: buildPlayerMapRoster(store.getPlayers(), username),
    server: landing.server,
    community: landing.community,
    telemetry: {
      available: Boolean(appConfig.telemetryToken || telemetryState.configured),
      connected: telemetryState.connected,
      lastSyncAt: telemetryState.lastSyncAt,
      lastSnapshotAt: telemetryState.lastSnapshotAt,
    },
  }
  response.json(portal)
})

app.get('/api/player/settings', (request, response) => {
  const username = playerAuth.username(request)
  if (!username) return response.status(401).json({ error: 'Player authentication required' })
  response.json(store.getPlayerSettings(username))
})

app.patch('/api/player/settings', (request, response) => {
  const username = playerAuth.username(request)
  if (!username) return response.status(401).json({ error: 'Player authentication required' })
  const theme = request.body?.theme
  if (!isPlayerTheme(theme)) return response.status(400).json({ error: 'Choose a valid theme' })
  const settings = store.setPlayerTheme(username, theme)
  store.addAudit({ category: 'auth', action: 'player-settings', target: username, success: true, detail: `Theme changed to ${theme}` })
  response.json(settings)
})

app.get('/api/player/requests', (request, response) => {
  const username = playerAuth.username(request)
  if (!username) return response.status(401).json({ error: 'Player authentication required' })
  response.json(store.getSupportRequestsForUser(username))
})

app.post('/api/player/requests', (request, response) => {
  const username = playerAuth.username(request)
  if (!username) return response.status(401).json({ error: 'Player authentication required' })
  try {
    const input = normalizeSupportRequestInput(request.body)
    const telemetry = store.getPlayer(username)?.telemetry
    const supportRequest = store.createSupportRequest({
      ...input,
      createdBy: username,
      ...(telemetry?.position ? {
        location: {
          ...telemetry.position,
          observedAt: telemetry.updatedAt,
        },
      } : {}),
    })
    store.addAudit({ category: 'request', action: 'create', target: supportRequest.id, success: true, detail: `${username} created a ${supportRequest.category} request` })
    notifyModerators({ kind: 'request-created', request: supportRequest })
    response.status(201).json(supportRequest)
  } catch (error) {
    store.addAudit({ category: 'request', action: 'create', target: username, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.post('/api/player/requests/:id/messages', (request, response) => {
  const username = playerAuth.username(request)
  if (!username) return response.status(401).json({ error: 'Player authentication required' })
  const id = String(request.params.id)
  try {
    const supportRequest = store.getSupportRequest(id)
    if (!supportRequest || supportRequest.createdBy.toLocaleLowerCase('en-US') !== username.toLocaleLowerCase('en-US')) {
      return response.status(404).json({ error: 'Support request was not found' })
    }
    const updated = store.addSupportRequestMessage(id, username, 'user', normalizeSupportRequestMessage(request.body?.message))
    store.addAudit({ category: 'request', action: 'player-comment', target: id, success: true, detail: `${username} replied` })
    notifyModerators({ kind: 'request-player-reply', request: updated, message: updated.messages.at(-1)?.body ?? '' })
    response.json(updated)
  } catch (error) {
    store.addAudit({ category: 'request', action: 'player-comment', target: id, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.post('/api/telemetry/player', (request, response) => {
  if (!tokenMatches(String(request.headers['x-telemetry-token'] ?? ''), appConfig.telemetryToken)) {
    return response.status(401).json({ error: 'Invalid telemetry token' })
  }
  const username = String(request.body?.username ?? '').trim().slice(0, 64)
  if (!username) return response.status(400).json({ error: 'username is required' })
  try {
    const telemetry = normalizePlayerTelemetry(request.body?.telemetry)
    store.updateTelemetry(username, telemetry)
    store.addAudit({ category: 'telemetry', action: 'player-update', target: username, success: true })
    response.json({ ok: true })
  } catch (error) {
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.use('/api', requireDashboardRole('moderator'))

app.get('/api/overview', (request, response) => {
  const players = store.getPlayers()
  const summary = appConfig.configSummary
  const telemetryState = telemetryBridge.getState()
  const serverConfigState = serverConfigBridge.getState()
  const overview: Overview = {
    connection: rcon.getState(),
    server: {
      name: summary.name,
      onlinePlayers: players.filter((player) => player.online).length,
      maxPlayers: summary.maxPlayers,
      map: summary.map,
      pvp: summary.pvp,
      public: summary.public,
      uptimeSince: store.getStartedAt(),
    },
    players,
    activity: store.getActivity(),
    recentAudit: requestDashboardIdentity(request).role === 'admin' ? store.getAudit(8) : [],
    config: summary,
    community: appConfig.playerPortal,
    integrations: {
      configFile: Boolean(appConfig.configPath || serverConfigState.configLoaded),
      sandboxFile: Boolean(appConfig.sandboxPath || serverConfigState.sandboxLoaded),
      configSource: appConfig.configPath ? 'local' : serverConfigState.configLoaded ? 'ftp' : 'none',
      configLastSyncAt: serverConfigState.lastSyncAt,
      configLastError: serverConfigState.lastError,
      telemetry: Boolean(appConfig.telemetryToken || telemetryState.configured),
      telemetrySource: telemetryState.configured ? 'ftp' : appConfig.telemetryToken ? 'http' : 'none',
      telemetryConnected: telemetryState.connected,
      telemetryLastSyncAt: telemetryState.lastSyncAt,
      telemetryLastSnapshotAt: telemetryState.lastSnapshotAt,
      telemetryLastError: telemetryState.lastError,
      telemetryPlayers: telemetryState.playerCount,
      gameRoles: availableGameRoles,
      providerName: appConfig.provider.name,
      providerUrl: appConfig.provider.url || undefined,
    },
  }
  response.json(overview)
})

app.get('/api/players', (_request, response) => response.json(store.getPlayers()))
app.get('/api/audit', requireDashboardRole('admin'), (request, response) => response.json(store.getAudit(Number(request.query.limit) || 100)))
app.get('/api/requests', (_request, response) => response.json(store.getSupportRequests()))

app.patch('/api/requests/:id', (request, response) => {
  const id = String(request.params.id)
  const actor = dashboardActor(request)
  try {
    const updated = request.body?.action === 'claim'
      ? store.claimSupportRequest(id, actor)
      : isSupportRequestStatus(request.body?.status)
        ? store.setSupportRequestStatus(id, request.body.status, actor)
        : (() => { throw new Error('Choose a valid request action or status') })()
    store.addAudit({ category: 'request', action: request.body?.action === 'claim' ? 'claim' : `status-${updated.status}`, target: id, success: true, detail: `${actor} updated ${updated.createdBy}'s request` })
    notifyModerators({ kind: 'request-updated', request: updated, actor, action: request.body?.action === 'claim' ? 'claim' : 'status' })
    response.json(updated)
  } catch (error) {
    store.addAudit({ category: 'request', action: 'staff-update', target: id, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.post('/api/requests/:id/messages', (request, response) => {
  const id = String(request.params.id)
  const identity = requestDashboardIdentity(request)
  const actor = dashboardActor(request)
  try {
    const updated = store.addSupportRequestMessage(id, actor, identity.role, normalizeSupportRequestMessage(request.body?.message))
    store.addAudit({ category: 'request', action: 'staff-comment', target: id, success: true, detail: `${actor} replied to ${updated.createdBy}` })
    notifyModerators({ kind: 'request-staff-reply', request: updated, actor, message: updated.messages.at(-1)?.body ?? '' })
    response.json(updated)
  } catch (error) {
    store.addAudit({ category: 'request', action: 'staff-comment', target: id, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})
app.get('/api/commands', requireDashboardRole('admin'), (_request, response) => response.json(commandDefinitions))
app.get('/api/config', requireDashboardRole('admin'), (_request, response) => {
  const serverConfigState = serverConfigBridge.getState()
  response.json({
    summary: appConfig.configSummary,
    sandbox: appConfig.sandboxText ? parseSandboxLua(appConfig.sandboxText) : {},
    sources: {
      ini: Boolean(appConfig.configPath || serverConfigState.configLoaded),
      sandbox: Boolean(appConfig.sandboxPath || serverConfigState.sandboxLoaded),
      source: appConfig.configPath ? 'local' : serverConfigState.configLoaded ? 'ftp' : 'none',
      lastSyncAt: serverConfigState.lastSyncAt,
      lastError: serverConfigState.lastError,
    },
  })
})

app.get('/api/admin/configuration', requireDashboardRole('admin'), (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  try {
    const current = loadSecureConfig(appConfig.secureConfig.directory)
    response.json({ ...editableSecureConfigState(current), restartScheduled: configurationRestartScheduled })
  } catch (error) {
    response.status(500).json({ error: errorMessage(error) })
  }
})

app.put('/api/admin/configuration', requireDashboardRole('admin'), (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  if (configurationRestartScheduled) return response.status(409).json({ error: 'A configuration restart is already scheduled' })
  try {
    const current = loadSecureConfig(appConfig.secureConfig.directory)
    const updated = updateEditableSecureConfig(current, request.body)
    saveSecureConfig(updated, appConfig.secureConfig.directory)
    store.addAudit({ category: 'system', action: 'secure-configuration-update', success: true, detail: `${dashboardActor(request)} updated encrypted configuration` })
    scheduleConfigurationRestart(response)
    response.json({ saved: true, restartScheduled: true })
  } catch (error) {
    store.addAudit({ category: 'system', action: 'secure-configuration-update', success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.post('/api/commands/:id', requireDashboardRole('admin'), async (request, response) => {
  const commandId = String(request.params.id)
  try {
    const built = buildDefinedCommand(commandId, request.body?.args)
    if (built.definition.impact === 'danger' && request.body?.confirm !== built.definition.id) {
      return response.status(400).json({ error: `Confirmation must equal ${built.definition.id}` })
    }
    if (built.definition.id === 'quit') await rcon.send('save')
    const output = validateDefinedCommandOutput(built.definition.id, await rcon.send(built.command))
    store.addAudit({ category: built.definition.category === 'world' || built.definition.category === 'weather' ? 'world' : 'server', action: built.definition.id, command: redactCommand(built.command), success: true })
    response.json({ ok: true, output, command: redactCommand(built.command) })
  } catch (error) {
    store.addAudit({ category: 'server', action: commandId, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.post('/api/players/:username/actions', async (request, response) => {
  const username = request.params.username.slice(0, 64)
  const action = String(request.body?.action ?? '') as PlayerAction
  try {
    let teleportPosition: ReturnType<typeof currentTeleportPosition>
    const identity = requestDashboardIdentity(request)
    const payload: Record<string, unknown> = request.body?.payload && typeof request.body.payload === 'object' && !Array.isArray(request.body.payload)
      ? { ...request.body.payload }
      : {}
    const moderationReason = isModeratorPlayerAction(action) ? validateModerationReason(payload.reason) : undefined
    if (identity.role !== 'admin' && !isModeratorPlayerAction(action)) {
      return response.status(403).json({ error: 'Administrator access required for this player action' })
    }
    if (['ban', 'teleport-coordinates', 'teleport-player', 'access-level', 'clear-map-symbols'].includes(action) && request.body?.confirm !== username) {
      return response.status(400).json({ error: `Confirmation must equal ${username}` })
    }
    if (action === 'teleport-coordinates' || action === 'teleport-player') {
      const source = store.getPlayer(username)
      if (!source?.online) throw new Error('The survivor must be online before teleporting')

      if (action === 'teleport-player') {
        const destination = store.getPlayer(String(payload.destination ?? ''))
        if (!destination?.online) throw new Error('The destination survivor must be online')
        payload.destination = destination.username
        teleportPosition = currentTeleportPosition(destination.telemetry)
      }
    }
    const command = teleportPosition
      ? buildPlayerTeleportToPositionCommand(username, teleportPosition)
      : buildPlayerCommand(username, action, payload)
    const output = validatePlayerActionOutput(teleportPosition ? 'teleport-coordinates' : action, await rcon.send(command))
    store.addAudit({ category: 'player', action, target: username, command: redactCommand(command), success: true, detail: moderationReason ? `Reason: ${moderationReason}` : undefined })
    if (moderationReason && isModeratorPlayerAction(action)) {
      notifyModerators({ kind: 'player-action', action, actor: dashboardActor(request), target: username, reason: moderationReason })
    }
    response.json({ ok: true, output, teleportMethod: teleportPosition ? 'coordinates' : 'player' })
  } catch (error) {
    store.addAudit({ category: 'player', action: action || 'unknown', target: username, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.post('/api/console', requireDashboardRole('admin'), async (request, response) => {
  try {
    const command = validateRawCommand(request.body?.command)
    if (/^(quit|removezombies|banuser)\b/i.test(command) && request.body?.confirm !== 'EXECUTE') {
      return response.status(400).json({ error: 'Type EXECUTE to run this high-impact command' })
    }
    const output = await rcon.send(command)
    store.addAudit({ category: 'console', action: 'execute', command: redactCommand(command), success: true })
    response.json({ ok: true, output })
  } catch (error) {
    store.addAudit({ category: 'console', action: 'execute', success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.post('/api/poll', async (_request, response) => {
  const players = await rcon.pollPlayers()
  if (players) store.markPlayersOnline(players)
  response.json({ ok: players !== null, players: players ?? store.getPlayers().filter((player) => player.online).map((player) => player.username) })
})

app.get('/api/admin/users', requireDashboardRole('admin'), (_request, response) => {
  response.json(store.getDashboardUsers())
})

app.get('/api/admin/live-settings', requireDashboardRole('admin'), async (_request, response) => {
  response.json(await liveSettings.snapshot((command) => rcon.send(command)))
})

app.patch('/api/admin/live-settings/:key', requireDashboardRole('admin'), async (request, response) => {
  const key = String(request.params.key)
  try {
    const change = liveSettings.buildChange(key, request.body?.value)
    if (change.definition.impact === 'caution' && request.body?.confirm !== change.definition.key) {
      return response.status(400).json({ error: `Confirmation must equal ${change.definition.key}` })
    }
    const output = validateLiveSettingOutput(await rcon.send(change.command))
    const setting = liveSettings.commit(change.definition.key, change.value)
    store.setLiveSettingOverride(change.definition.key, change.value, dashboardActor(request))
    updateConfigSummary(change.definition.key, change.value)
    store.addAudit({ category: 'server', action: 'live-setting', target: change.definition.key, command: change.command, success: true, detail: `${dashboardActor(request)} set ${change.definition.key} to ${change.value}` })
    response.json({ setting, output })
  } catch (error) {
    store.addAudit({ category: 'server', action: 'live-setting', target: key, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.get('/api/admin/sandbox-settings', requireDashboardRole('admin'), (_request, response) => {
  const values = appConfig.sandboxText ? parseSandboxLua(appConfig.sandboxText) : {}
  const snapshot: SandboxSettingsSnapshot = {
    configured: sandboxControl.isConfigured(),
    settings: sandboxSettingsFromValues(values),
    refreshedAt: new Date().toISOString(),
    warning: !appConfig.sandboxText
      ? 'SandboxVars.lua has not been loaded from the server yet.'
      : !sandboxControl.isConfigured()
        ? 'Live SandboxVars changes require the telemetry FTP/FTPS connection.'
        : undefined,
  }
  response.json(snapshot)
})

app.patch('/api/admin/sandbox-settings/:key', requireDashboardRole('admin'), async (request, response) => {
  const key = String(request.params.key)
  try {
    if (request.body?.confirm !== key) return response.status(400).json({ error: `Confirmation must equal ${key}` })
    const values = appConfig.sandboxText ? parseSandboxLua(appConfig.sandboxText) : {}
    const setting = sandboxSettingsFromValues(values).find((entry) => entry.key === key)
    if (!setting) throw new Error('This SandboxVars option is not present in the loaded server configuration')
    const requestedValue = normalizeSandboxValue(setting, request.body?.value)
    const result = await sandboxControl.apply(setting.option, requestedValue)
    const appliedValue = normalizeSandboxValue(setting, result.value)
    setting.value = setting.kind === 'boolean'
      ? appliedValue === 'true'
      : setting.kind === 'number'
        ? Number(appliedValue)
        : appliedValue
    await serverConfigBridge.poll()
    store.addAudit({
      category: 'server',
      action: 'sandbox-setting',
      target: key,
      success: true,
      detail: `${dashboardActor(request)} set ${setting.option} to ${appliedValue} live and persisted it`,
    })
    response.json({ setting, message: result.message, appliedAt: result.appliedAt })
  } catch (error) {
    store.addAudit({ category: 'server', action: 'sandbox-setting', target: key, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

app.patch('/api/admin/users/:username/role', requireDashboardRole('admin'), (request, response) => {
  const username = String(request.params.username ?? '').trim().slice(0, 64)
  const role = String(request.body?.role ?? '') as DashboardRole
  try {
    if (!['user', 'moderator', 'admin'].includes(role)) throw new Error('Choose a valid dashboard role')
    if (request.body?.confirm !== username) return response.status(400).json({ error: `Confirmation must equal ${username}` })
    const previousRole = store.getDashboardRole(username)
    const updated = store.setDashboardRole(username, role, dashboardActor(request))
    store.addAudit({
      category: 'auth',
      action: 'role-change',
      target: updated.username,
      success: true,
      detail: `${previousRole} to ${role} by ${dashboardActor(request)}`,
    })
    response.json(updated)
  } catch (error) {
    store.addAudit({ category: 'auth', action: 'role-change', target: username || undefined, success: false, detail: errorMessage(error) })
    response.status(400).json({ error: errorMessage(error) })
  }
})

const clientPath = resolve('dist/client')
if (appConfig.production && existsSync(clientPath)) {
  app.use(express.static(clientPath, { index: false, maxAge: '1h' }))
  app.use((request: Request, response: Response) => {
    if (request.path.startsWith('/api/')) return response.status(404).json({ error: 'Not found' })
    response.sendFile(resolve(clientPath, 'index.html'))
  })
}

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
  if (setupToken) {
    const browserHost = ['0.0.0.0', '::'].includes(appConfig.host) ? '127.0.0.1' : appConfig.host
    const setupBaseUrl = process.env.PZ_SETUP_PUBLIC_URL?.trim()
      || (appConfig.production ? `http://${browserHost}:${appConfig.port}` : 'http://127.0.0.1:5173')
    console.log(`One-time secure setup: ${setupBaseUrl.replace(/\/$/, '')}/setup?token=${setupToken}`)
    console.log('The setup token is valid only until configuration is saved or the process restarts.')
  }
})

async function poll() {
  const players = await rcon.pollPlayers()
  if (players) store.markPlayersOnline(players)
}

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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(pollTimer)
    if (telemetryFtpPollTimer) clearInterval(telemetryFtpPollTimer)
    if (serverConfigFtpPollTimer) clearInterval(serverConfigFtpPollTimer)
    server.close(() => process.exit(0))
  })
}
