<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AuditEntry, CommandDefinition, DashboardRole, DashboardSession, DashboardUser, LiveSettingCategory, LiveSettingsSnapshot, LiveSettingState, Overview, PlayerPortalCommunity, PlayerRecord, PlayerSettings, PlayerTheme, SetupStatus, SupportRequest, SupportRequestCategory, SupportRequestStatus } from '@shared/types'
import { activeSupportRequestStatuses, supportRequestCategories } from '@shared/support-requests'
import { PLAYER_XP_PERKS } from '@shared/perks'
import { isAdminConsolePath } from '@shared/routes'
import PlayerPortal from './PlayerPortal.vue'
import SetupView from './SetupView.vue'
import ZomboidMap from './ZomboidMap.vue'

type Page = 'overview' | 'players' | 'requests' | 'users' | 'server' | 'world' | 'settings' | 'mods' | 'console' | 'audit'
const adminConsoleMode = isAdminConsolePath(window.location.pathname)
const setupMode = ref(window.location.pathname === '/setup')
const setupChecking = ref(true)
const setupStatus = ref<SetupStatus | null>(null)
document.title = setupMode.value ? 'PZ RCON Admin // Secure Setup' : adminConsoleMode ? 'Project Zomboid // Server Control' : 'Project Zomboid // Survivor Network'

const allNavItems: Array<{ id: Page; label: string; icon: string; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'players', label: 'Survivors', icon: 'users' },
  { id: 'requests', label: 'Request queue', icon: 'list' },
  { id: 'users', label: 'Dashboard users', icon: 'users', adminOnly: true },
  { id: 'server', label: 'Server control', icon: 'server', adminOnly: true },
  { id: 'world', label: 'World director', icon: 'world', adminOnly: true },
  { id: 'settings', label: 'Live settings', icon: 'sliders', adminOnly: true },
  { id: 'mods', label: 'Mods & config', icon: 'sliders', adminOnly: true },
  { id: 'console', label: 'RCON console', icon: 'terminal', adminOnly: true },
  { id: 'audit', label: 'Audit log', icon: 'list' },
]
const dashboardRoleOptions: DashboardRole[] = ['user', 'moderator', 'admin']

const page = ref<Page>('overview')
const loading = ref(true)
const authenticated = ref(false)
const authRequired = ref(false)
const identityAuthenticated = ref(false)
const sessionUsername = ref('')
const sessionRole = ref<DashboardRole>('user')
const sessionMethod = ref<'player' | 'bootstrap' | undefined>()
const playerTheme = ref<PlayerTheme>('green')
const password = ref('')
const authError = ref('')
const overview = ref<Overview | null>(null)
const community = ref<PlayerPortalCommunity>({
  name: 'Project Zomboid',
  initials: 'PZ',
  tagline: 'Survivor network',
  portalTitle: 'Your life. Your record.',
  portalDescription: 'Check the server, jump back in, or open your private character record.',
})
const commands = ref<CommandDefinition[]>([])
const audit = ref<AuditEntry[]>([])
const dashboardUsers = ref<DashboardUser[]>([])
const liveSettings = ref<LiveSettingState[]>([])
const liveSettingDrafts = ref<Record<string, string | boolean>>({})
const liveSettingsWarning = ref('')
const liveSettingsRefreshedAt = ref('')
const supportRequests = ref<SupportRequest[]>([])
const selectedRequestId = ref<string | null>(null)
const requestFilter = ref<'active' | 'all'>('active')
const staffRequestReply = ref('')
const sandbox = ref<Record<string, string | number | boolean>>({})
const expandedPlayerUsername = ref<string | null>(null)
const toast = ref<{ message: string; error?: boolean } | null>(null)
const busy = ref('')
const announcement = ref('')
const worldTarget = ref('')
const hordeCount = ref('25')
const playerReason = ref('')
const itemName = ref('Base.Axe')
const itemCount = ref('1')
const perkName = ref('Fitness')
const xpAmount = ref('100')
const vehicleScript = ref('Base.VanAmbulance')
const keyId = ref('')
const keyName = ref('Issued by admin')
const teleportX = ref('')
const teleportY = ref('')
const teleportZ = ref('0')
const teleportDestination = ref('')
const modSearch = ref('')
const settingsSearch = ref('')
const consoleCommand = ref('')
const consoleConfirm = ref('')
const consoleLines = ref<Array<{ at: string; command: string; output: string; error?: boolean }>>([])
const godModeEnabled = ref<Record<string, boolean>>({})
let refreshTimer: number | undefined
let toastTimer: number | undefined

const isAdmin = computed(() => sessionRole.value === 'admin')
const navItems = computed(() => allNavItems.filter((item) => !item.adminOnly || isAdmin.value))
const brandName = computed(() => community.value.name)
const brandInitials = computed(() => community.value.initials)
const brandTagline = computed(() => community.value.tagline)

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body as T
}

function notify(message: string, error = false) {
  toast.value = { message, error }
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = null }, 4200)
}

async function loadSession() {
  const session = await api<DashboardSession>('/api/session')
  community.value = session.community
  document.title = `${session.community.name} // Server Control`
  authenticated.value = session.authenticated
  identityAuthenticated.value = session.identityAuthenticated
  authRequired.value = session.required
  sessionUsername.value = session.username ?? ''
  sessionRole.value = session.role ?? 'user'
  sessionMethod.value = session.method
  if (session.method === 'player') {
    try {
      playerTheme.value = (await api<PlayerSettings>('/api/player/settings')).theme
    } catch {
      playerTheme.value = 'green'
    }
  } else {
    playerTheme.value = 'green'
  }
  if (session.authenticated) await loadAll()
  loading.value = false
}

async function login() {
  authError.value = ''
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: password.value }) })
    password.value = ''
    await loadSession()
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Unable to sign in'
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST', body: '{}' })
  authenticated.value = false
  identityAuthenticated.value = false
  sessionUsername.value = ''
  sessionRole.value = 'user'
  sessionMethod.value = undefined
  playerTheme.value = 'green'
  overview.value = null
}

function goToPlayerPortal() {
  window.location.assign('/')
}

async function loadAll(silent = false) {
  try {
    const [nextOverview, nextCommands, nextAudit, config, nextRequests] = await Promise.all([
      api<Overview>('/api/overview'),
      !isAdmin.value || commands.value.length ? Promise.resolve(commands.value) : api<CommandDefinition[]>('/api/commands'),
      page.value === 'audit' || !audit.value.length ? api<AuditEntry[]>('/api/audit?limit=200') : Promise.resolve(audit.value),
      !isAdmin.value || Object.keys(sandbox.value).length ? Promise.resolve({ sandbox: sandbox.value }) : api<{ sandbox: Record<string, string | number | boolean> }>('/api/config'),
      api<SupportRequest[]>('/api/requests'),
    ])
    overview.value = nextOverview
    community.value = nextOverview.community
    commands.value = nextCommands
    audit.value = nextAudit
    sandbox.value = config.sandbox
    supportRequests.value = nextRequests
    if (!selectedRequestId.value && nextRequests.length) {
      selectedRequestId.value = nextRequests.find((request) => activeSupportRequestStatuses.includes(request.status))?.id ?? nextRequests[0].id
    }
  } catch (error) {
    if (!silent) notify(error instanceof Error ? error.message : 'Could not load dashboard', true)
  }
}

function supportRequestCategoryLabel(category: SupportRequestCategory): string {
  return supportRequestCategories.find((definition) => definition.id === category)?.label ?? category
}

function supportRequestStatusLabel(status: SupportRequestStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function supportRequestLocation(request: SupportRequest): string {
  const location = request.location
  return location ? `${location.x.toFixed(0)}, ${location.y.toFixed(0)}, z${location.z.toFixed(0)} · ${relativeTime(location.observedAt)}` : 'Not attached'
}

async function claimSupportRequest(request: SupportRequest) {
  busy.value = `request-${request.id}`
  try {
    const updated = await api<SupportRequest>(`/api/requests/${encodeURIComponent(request.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'claim' }),
    })
    supportRequests.value = supportRequests.value.map((item) => item.id === updated.id ? updated : item)
    notify(`Request claimed for ${updated.createdBy}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Request could not be claimed', true)
  } finally {
    busy.value = ''
  }
}

async function changeSupportRequestStatus(request: SupportRequest, status: SupportRequestStatus) {
  const caution = status === 'denied' || status === 'completed'
  if (caution && !window.confirm(`${supportRequestStatusLabel(status)} ${request.createdBy}'s request: ${request.subject}?`)) return
  busy.value = `request-${request.id}`
  try {
    const updated = await api<SupportRequest>(`/api/requests/${encodeURIComponent(request.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    supportRequests.value = supportRequests.value.map((item) => item.id === updated.id ? updated : item)
    notify(`${updated.subject} is now ${supportRequestStatusLabel(updated.status)}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Request status could not be updated', true)
  } finally {
    busy.value = ''
  }
}

async function addStaffRequestMessage(request: SupportRequest) {
  if (!staffRequestReply.value.trim()) return
  busy.value = `request-message-${request.id}`
  try {
    const updated = await api<SupportRequest>(`/api/requests/${encodeURIComponent(request.id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: staffRequestReply.value }),
    })
    supportRequests.value = supportRequests.value.map((item) => item.id === updated.id ? updated : item)
    staffRequestReply.value = ''
    notify(`Reply sent to ${updated.createdBy}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Reply could not be sent', true)
  } finally {
    busy.value = ''
  }
}

function openRequestSurvivor(request: SupportRequest) {
  page.value = 'players'
  expandedPlayerUsername.value = request.createdBy
}

function navCount(item: { id: Page }): number {
  if (item.id === 'players') return onlinePlayers.value.length
  if (item.id === 'requests') return supportRequests.value.filter((request) => request.status === 'open').length
  return 0
}

async function loadDashboardUsers() {
  if (!isAdmin.value) return
  try {
    dashboardUsers.value = await api<DashboardUser[]>('/api/admin/users')
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not load dashboard users', true)
  }
}

async function changeDashboardRole(user: DashboardUser, role: DashboardRole) {
  if (user.role === role) return
  const warning = user.username.toLocaleLowerCase('en-US') === sessionUsername.value.toLocaleLowerCase('en-US')
    ? `Change your own role from ${user.role} to ${role}? You may immediately lose access to this console.`
    : `Change ${user.username} from ${user.role} to ${role}?`
  if (!window.confirm(warning)) return
  busy.value = `role-${user.username}`
  try {
    const updated = await api<DashboardUser>(`/api/admin/users/${encodeURIComponent(user.username)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, confirm: user.username }),
    })
    dashboardUsers.value = dashboardUsers.value.map((item) => item.username === updated.username ? updated : item)
    notify(`${updated.username} is now ${updated.role}`)
    if (updated.username.toLocaleLowerCase('en-US') === sessionUsername.value.toLocaleLowerCase('en-US')) await loadSession()
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Role change failed', true)
  } finally {
    busy.value = ''
  }
}

async function loadLiveSettings() {
  if (!isAdmin.value) return
  try {
    const snapshot = await api<LiveSettingsSnapshot>('/api/admin/live-settings')
    liveSettings.value = snapshot.settings
    liveSettingsWarning.value = snapshot.warning ?? ''
    liveSettingsRefreshedAt.value = snapshot.refreshedAt
    liveSettingDrafts.value = Object.fromEntries(snapshot.settings.map((setting) => [
      setting.key,
      setting.kind === 'boolean' ? Boolean(setting.value) : setting.value === undefined ? '' : String(setting.value),
    ]))
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not load live settings', true)
  }
}

async function changeLiveSetting(setting: LiveSettingState, value: string | boolean) {
  if (setting.impact === 'caution' && !window.confirm(`${setting.label}\n\n${setting.description}\n\nApply this immediately to the running server?`)) {
    liveSettingDrafts.value[setting.key] = setting.kind === 'boolean' ? Boolean(setting.value) : setting.value === undefined ? '' : String(setting.value)
    return
  }
  busy.value = `setting-${setting.key}`
  try {
    const result = await api<{ setting: LiveSettingState; output: string }>(`/api/admin/live-settings/${encodeURIComponent(setting.key)}`, {
      method: 'PATCH',
      body: JSON.stringify({ value, confirm: setting.impact === 'caution' ? setting.key : undefined }),
    })
    liveSettings.value = liveSettings.value.map((item) => item.key === setting.key ? result.setting : item)
    liveSettingDrafts.value[setting.key] = result.setting.kind === 'boolean' ? Boolean(result.setting.value) : String(result.setting.value ?? '')
    notify(`${result.setting.label} updated live${result.setting.requiresPlayerReconnect ? ' — players must reconnect to refresh it' : ''}`)
    await loadAll(true)
  } catch (error) {
    liveSettingDrafts.value[setting.key] = setting.kind === 'boolean' ? Boolean(setting.value) : setting.value === undefined ? '' : String(setting.value)
    notify(error instanceof Error ? error.message : 'Live setting change failed', true)
  } finally {
    busy.value = ''
  }
}

async function pollNow() {
  busy.value = 'poll'
  try {
    await api('/api/poll', { method: 'POST', body: '{}' })
    await loadAll(true)
    notify('Live server state refreshed')
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Refresh failed', true)
  } finally {
    busy.value = ''
  }
}

async function runCommand(id: string, args: Record<string, string> = {}) {
  const definition = commands.value.find((command) => command.id === id)
  if (!definition) return
  if (definition.impact === 'danger' && !window.confirm(`${definition.label}\n\n${definition.description}\n\nContinue?`)) return
  busy.value = id
  try {
    const result = await api<{ output: string }>(`/api/commands/${id}`, {
      method: 'POST',
      body: JSON.stringify({ args, confirm: definition.impact === 'danger' ? id : undefined }),
    })
    notify(`${definition.label} completed`)
    consoleLines.value.unshift({ at: new Date().toISOString(), command: definition.command, output: result.output })
    if (id === 'announce') announcement.value = ''
    await loadAll(true)
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Command failed', true)
  } finally {
    busy.value = ''
  }
}

async function playerAction(username: string, action: string, payload: Record<string, unknown> = {}) {
  if (['kick', 'ban', 'remove-whitelist'].includes(action) && !window.confirm(`${action === 'ban' ? 'Ban' : action === 'kick' ? 'Kick' : 'Remove from whitelist'} ${username}?`)) return false
  if (action === 'teleport-coordinates' && !window.confirm(`Teleport ${username} to ${payload.x}, ${payload.y}, z${payload.z}?\n\nMake sure the destination is safe and loaded.`)) return false
  if (action === 'teleport-player' && !window.confirm(`Teleport ${username} to ${payload.destination}?`)) return false
  busy.value = `player-${action}`
  try {
    const result = await api<{ output: string }>(`/api/players/${encodeURIComponent(username)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, payload, confirm: ['ban', 'teleport-coordinates', 'teleport-player'].includes(action) ? username : undefined }),
    })
    if (action === 'godmode') {
      notify(`God mode ${payload.enabled === false ? 'disabled' : 'enabled'} for ${username}`)
    } else if (action === 'addxp') {
      const perk = PLAYER_XP_PERKS.find((item) => item.value === payload.perk)
      notify(`${payload.amount} ${perk?.label ?? payload.perk} XP granted to ${username}`)
    } else if (action === 'teleport-coordinates') {
      notify(`${username} teleported to ${payload.x}, ${payload.y}, z${payload.z}`)
    } else if (action === 'teleport-player') {
      notify(`${username} teleported to ${payload.destination}`)
    } else {
      notify(`${action} command completed for ${username}`)
    }
    consoleLines.value.unshift({ at: new Date().toISOString(), command: `${action} ${username}`, output: result.output })
    await loadAll(true)
    return true
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Player command failed', true)
    return false
  } finally {
    busy.value = ''
  }
}

async function toggleGodMode(username: string) {
  const enabled = !godModeEnabled.value[username]
  if (await playerAction(username, 'godmode', { enabled })) godModeEnabled.value[username] = enabled
}

function togglePlayer(username: string) {
  expandedPlayerUsername.value = expandedPlayerUsername.value === username ? null : username
}

function playerPanelId(username: string): string {
  return `survivor-${encodeURIComponent(username).replace(/%/g, '_')}`
}

function developedPerks(player: PlayerRecord): Array<[string, number]> {
  return Object.entries(player.telemetry?.perks ?? {})
    .filter(([, level]) => level > 0)
    .sort(([leftName, leftLevel], [rightName, rightLevel]) => rightLevel - leftLevel || leftName.localeCompare(rightName))
}

function canTeleportToPlayer(username: string): boolean {
  const source = username.toLocaleLowerCase('en-US')
  const destination = teleportDestination.value.toLocaleLowerCase('en-US')
  return Boolean(destination) && onlinePlayers.value.some((player) => (
    player.username.toLocaleLowerCase('en-US') === destination
    && player.username.toLocaleLowerCase('en-US') !== source
  ))
}

async function executeConsole() {
  const command = consoleCommand.value.trim()
  if (!command) return
  busy.value = 'console'
  try {
    const result = await api<{ output: string }>('/api/console', {
      method: 'POST',
      body: JSON.stringify({ command, confirm: consoleConfirm.value }),
    })
    consoleLines.value.unshift({ at: new Date().toISOString(), command, output: result.output })
    consoleCommand.value = ''
    consoleConfirm.value = ''
    notify('Command executed')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed'
    consoleLines.value.unshift({ at: new Date().toISOString(), command, output: message, error: true })
    notify(message, true)
  } finally {
    busy.value = ''
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (!hours) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function relativeTime(value?: string): string {
  if (!value) return 'Never'
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000))
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function liveSettingMeta(setting: LiveSettingState): string {
  const parts = [setting.key, setting.source]
  if (setting.min !== undefined && setting.max !== undefined) {
    parts.push(`${setting.min}–${setting.max}${setting.unit ? ` ${setting.unit}` : ''}`)
  }
  return parts.join(' · ')
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const onlinePlayers = computed(() => overview.value?.players.filter((player) => player.online) ?? [])
const offlinePlayers = computed(() => overview.value?.players.filter((player) => !player.online) ?? [])
const observedVehicles = computed(() => {
  const vehicles = new Map<number, { keyId: number; script?: string; username: string }>()
  for (const player of overview.value?.players ?? []) {
    const vehicle = player.telemetry?.vehicle
    if (vehicle && !vehicles.has(vehicle.keyId)) vehicles.set(vehicle.keyId, { ...vehicle, username: player.username })
  }
  return [...vehicles.values()]
})
const modeLabel = computed(() => overview.value?.connection.mode === 'live' ? 'LIVE RCON' : overview.value?.connection.mode === 'demo' ? 'DEMO DATA' : 'NOT CONFIGURED')
const connectionLabel = computed(() => overview.value?.connection.connected ? 'Connected' : 'Disconnected')
const telemetryStatusLabel = computed(() => {
  const integration = overview.value?.integrations
  if (!integration || integration.telemetrySource === 'none') return 'Not configured'
  if (integration.telemetrySource === 'http') return 'HTTP receiver ready'
  if (integration.telemetryConnected) return 'Telemetry synced'
  return integration.telemetryLastError ? 'FTP needs attention' : 'FTP configured'
})
const telemetryStatusDetail = computed(() => {
  const integration = overview.value?.integrations
  if (!integration || integration.telemetrySource === 'none') return 'Install the server exporter and configure FTP'
  if (integration.telemetrySource === 'http') return 'Waiting for authenticated bridge data'
  if (integration.telemetryLastError) return integration.telemetryLastError
  if (integration.telemetryLastSyncAt) return `${integration.telemetryPlayers} players · synced ${relativeTime(integration.telemetryLastSyncAt)}`
  return 'Waiting for the first server snapshot'
})
const filteredMods = computed(() => {
  const query = modSearch.value.toLowerCase().trim()
  const mods = overview.value?.config.mods ?? []
  return query ? mods.filter((mod) => mod.toLowerCase().includes(query)) : mods
})
const filteredWorkshop = computed(() => {
  const query = modSearch.value.toLowerCase().trim()
  const items = overview.value?.config.workshopItems ?? []
  return query ? items.filter((item) => item.includes(query)) : items
})
const filteredSettings = computed(() => {
  const query = settingsSearch.value.toLowerCase().trim()
  const combined = {
    ...(overview.value?.config.values ?? {}),
    ...Object.fromEntries(Object.entries(sandbox.value).map(([key, value]) => [`Sandbox.${key}`, value])),
  }
  return Object.entries(combined)
    .filter(([key, value]) => !query || `${key} ${value}`.toLowerCase().includes(query))
    .sort(([left], [right]) => left.localeCompare(right))
})
const chartPoints = computed(() => {
  const points = overview.value?.activity.slice(-48) ?? []
  if (!points.length) return '0,92 600,92'
  const max = Math.max(overview.value?.server.maxPlayers ?? 1, ...points.map((point) => point.online), 1)
  return points.map((point, index) => {
    const x = points.length === 1 ? 600 : index * (600 / (points.length - 1))
    const y = 100 - (point.online / max) * 82
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})
const serverCommands = computed(() => commands.value.filter((command) => ['server', 'maintenance'].includes(command.category) && command.id !== 'announce'))
const worldCommands = computed(() => commands.value.filter((command) => ['world', 'weather'].includes(command.category)))
const filteredSupportRequests = computed(() => requestFilter.value === 'all'
  ? supportRequests.value
  : supportRequests.value.filter((request) => activeSupportRequestStatuses.includes(request.status)))
const selectedSupportRequest = computed(() => filteredSupportRequests.value.find((request) => request.id === selectedRequestId.value)
  ?? filteredSupportRequests.value[0]
  ?? null)
const openSupportRequestCount = computed(() => supportRequests.value.filter((request) => request.status === 'open').length)
const liveSettingCategories = computed(() => {
  const categories: LiveSettingCategory[] = ['Access', 'Chat', 'PvP', 'Safehouses', 'Visibility', 'Factions', 'Voice', 'Anti-grief', 'Maintenance']
  return categories.map((category) => ({ category, settings: liveSettings.value.filter((setting) => setting.category === category) }))
})

watch(page, (nextPage) => {
  if (nextPage === 'users') void loadDashboardUsers()
  if (nextPage === 'settings') void loadLiveSettings()
  if (nextPage === 'audit') void loadAll(true)
})

onMounted(async () => {
  try {
    setupStatus.value = await api<SetupStatus>('/api/setup/status')
    setupMode.value = setupMode.value || setupStatus.value.required
    if (setupMode.value) document.title = 'PZ RCON Admin // Secure Setup'
  } finally {
    setupChecking.value = false
  }
  if (setupMode.value) return
  if (!adminConsoleMode) return
  await loadSession()
  refreshTimer = window.setInterval(() => {
    if (authenticated.value) void loadAll(true)
  }, 10_000)
})

onBeforeUnmount(() => {
  window.clearInterval(refreshTimer)
  window.clearTimeout(toastTimer)
})
</script>

<template>
  <div v-if="setupChecking" class="splash">
    <div class="splash-mark">PZ</div>
    <p>Checking secure configuration...</p>
  </div>

  <SetupView v-else-if="setupMode && setupStatus" :status="setupStatus" />

  <PlayerPortal v-else-if="!adminConsoleMode" />

  <div v-else-if="loading" class="splash">
    <div class="splash-mark">PZ</div>
    <p>Establishing secure console...</p>
  </div>

  <main v-else-if="!authenticated" class="login-shell" :data-player-theme="playerTheme">
    <section class="login-card">
      <div class="brand-lockup">
        <span class="brand-mark">{{ brandInitials }}</span>
        <div><strong>{{ brandName }}</strong><small>{{ brandTagline }}</small></div>
      </div>
      <div class="login-copy">
        <p class="eyebrow">{{ identityAuthenticated ? 'Role restricted' : 'Restricted system' }}</p>
        <h1>{{ identityAuthenticated ? 'Dashboard access' : 'Administrator' }}<br />required.</h1>
        <p v-if="identityAuthenticated">{{ sessionUsername }} is signed in as a User. An administrator must grant Moderator or Admin access before this account can open the control console.</p>
        <p v-else>Sign in through the survivor portal with an authorized Project Zomboid account.</p>
      </div>
      <form @submit.prevent="login" class="login-form">
        <label for="password">Bootstrap administrator password</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" autofocus />
        <p v-if="authError" class="form-error">{{ authError }}</p>
        <button class="button primary" type="submit">Use emergency admin access <span>→</span></button>
      </form>
      <div class="login-footnote-row">
        <p class="login-footnote">Secrets remain on the server and are never sent to the browser.</p>
        <a href="/" @click.prevent="goToPlayerPortal">← Back to survivor portal</a>
      </div>
    </section>
  </main>

  <div v-else-if="overview" class="app-shell" :data-player-theme="playerTheme">
    <aside class="sidebar">
      <div class="brand-lockup sidebar-brand">
        <span class="brand-mark">{{ brandInitials }}</span>
        <div><strong>{{ brandName }}</strong><small>Server control</small></div>
      </div>

      <nav aria-label="Admin sections">
        <button v-for="item in navItems" :key="item.id" :class="['nav-item', { active: page === item.id }]" :aria-label="item.label" @click="page = item.id">
          <span :class="['nav-icon', `icon-${item.icon}`]" aria-hidden="true"></span>
          <span>{{ item.label }}</span>
          <span v-if="navCount(item)" class="nav-count">{{ navCount(item) }}</span>
        </button>
      </nav>

      <div class="sidebar-foot">
        <div class="connection-card">
          <div class="connection-row"><span :class="['status-dot', { live: overview.connection.connected }]"></span><strong>{{ connectionLabel }}</strong></div>
          <p>{{ modeLabel }}</p>
          <small>Last poll {{ relativeTime(overview.connection.lastPollAt) }}</small>
        </div>
        <button v-if="authRequired" class="text-button" @click="logout">Lock dashboard</button>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div>
          <p class="breadcrumb">{{ brandName.toUpperCase() }} <span>/</span> {{ navItems.find((item) => item.id === page)?.label.toUpperCase() }}</p>
          <h1>{{ navItems.find((item) => item.id === page)?.label }}</h1>
        </div>
        <div class="topbar-actions">
          <div class="server-pill">{{ sessionMethod === 'bootstrap' ? 'BOOTSTRAP ADMIN' : `${sessionUsername} · ${sessionRole.toUpperCase()}` }}</div>
          <div class="server-pill"><span :class="['status-dot', { live: overview.connection.connected }]"></span>{{ overview.server.name }}</div>
          <button class="icon-button" title="Refresh live state" :disabled="busy === 'poll'" @click="pollNow">↻</button>
          <a class="button outline compact" href="/">Player portal</a>
          <a v-if="isAdmin && overview.integrations.providerUrl" class="button outline compact" :href="overview.integrations.providerUrl" target="_blank" rel="noreferrer">{{ overview.integrations.providerName }} ↗</a>
        </div>
      </header>

      <section class="content">
        <template v-if="page === 'overview'">
          <div v-if="overview.connection.mode !== 'live'" :class="['mode-banner', overview.connection.mode]">
            <strong>{{ modeLabel }}</strong>
            <span v-if="overview.connection.mode === 'demo'">Actions are simulated. Add the RCON settings to switch to your live server.</span>
            <span v-else>Configure the RCON host, port, and password to enable live administration.</span>
          </div>

          <div class="metric-grid">
            <article class="metric-card hero-metric">
              <div class="metric-head"><span>Survivors online</span><span class="metric-tag">LIVE</span></div>
              <strong>{{ overview.server.onlinePlayers }}<small>/ {{ overview.server.maxPlayers }}</small></strong>
              <div class="capacity-track"><span :style="{ width: `${Math.min(100, (overview.server.onlinePlayers / Math.max(overview.server.maxPlayers, 1)) * 100)}%` }"></span></div>
              <p>{{ overview.server.onlinePlayers ? `${overview.server.onlinePlayers} active in the exclusion zone` : 'The streets are quiet' }}</p>
            </article>
            <article class="metric-card">
              <div class="metric-head"><span>RCON link</span><span :class="['mini-indicator', { good: overview.connection.connected }]">{{ overview.connection.connected ? 'HEALTHY' : 'DOWN' }}</span></div>
              <strong class="metric-word">{{ overview.connection.connected ? 'ONLINE' : 'OFFLINE' }}</strong>
              <p>Polling every {{ overview.connection.pollSeconds }} seconds</p>
            </article>
            <article class="metric-card">
              <div class="metric-head"><span>Installed mods</span><span class="mini-indicator neutral">CONFIG</span></div>
              <strong>{{ overview.config.mods.length }}</strong>
              <p>{{ overview.config.workshopItems.length }} Steam Workshop items</p>
            </article>
            <article class="metric-card">
              <div class="metric-head"><span>World rules</span><span :class="['mini-indicator', overview.server.pvp ? 'danger' : 'neutral']">{{ overview.server.pvp ? 'PVP' : 'PVE' }}</span></div>
              <strong class="metric-word">{{ overview.config.pauseEmpty ? 'PAUSED' : 'ACTIVE' }}</strong>
              <p>{{ overview.config.pauseEmpty ? 'Time pauses while empty' : 'World runs while empty' }}</p>
            </article>
          </div>

          <div class="overview-grid">
            <article class="panel activity-panel">
              <div class="panel-heading">
                <div><p class="eyebrow">Last 48 samples</p><h2>Player activity</h2></div>
                <span class="panel-stat">Peak {{ Math.max(0, ...overview.activity.slice(-48).map((point) => point.online)) }}</span>
              </div>
              <div class="chart-wrap">
                <div class="chart-y"><span>{{ overview.server.maxPlayers }}</span><span>{{ Math.round(overview.server.maxPlayers / 2) }}</span><span>0</span></div>
                <svg viewBox="0 0 600 110" preserveAspectRatio="none" aria-label="Online player activity chart">
                  <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a7b46a" stop-opacity=".35"/><stop offset="100%" stop-color="#a7b46a" stop-opacity="0"/></linearGradient></defs>
                  <line x1="0" y1="18" x2="600" y2="18" /><line x1="0" y1="59" x2="600" y2="59" /><line x1="0" y1="100" x2="600" y2="100" />
                  <polyline :points="`0,100 ${chartPoints} 600,100`" fill="url(#area)" stroke="none" />
                  <polyline :points="chartPoints" fill="none" class="activity-line" />
                </svg>
              </div>
              <div class="chart-foot"><span>Older</span><span>Live</span></div>
            </article>

            <article v-if="isAdmin" class="panel quick-panel">
              <div class="panel-heading"><div><p class="eyebrow">RCON actions</p><h2>Quick command</h2></div></div>
              <label for="announcement">Server-wide announcement</label>
              <textarea id="announcement" v-model="announcement" rows="3" maxlength="300" placeholder="Tell everyone what is happening..."></textarea>
              <button class="button primary full" :disabled="!announcement.trim() || busy === 'announce'" @click="runCommand('announce', { message: announcement })">Broadcast to all players</button>
              <div class="quick-actions">
                <button :disabled="busy === 'save'" @click="runCommand('save')"><span>◆</span> Save world</button>
                <button :disabled="busy === 'poll'" @click="pollNow"><span>↻</span> Refresh state</button>
              </div>
            </article>
            <article v-else class="panel quick-panel moderator-scope-panel">
              <div class="panel-heading"><div><p class="eyebrow">Moderator access</p><h2>Oversight and moderation</h2></div></div>
              <p>Review live activity, inspect survivor records, and use the moderation controls on the Survivors page. Server commands, world controls, settings, and RCON remain Admin-only.</p>
              <button class="button outline full" @click="page = 'players'">Open survivor moderation</button>
            </article>
          </div>

          <div class="overview-grid lower">
            <article class="panel">
              <div class="panel-heading"><div><p class="eyebrow">Current world</p><h2>Server profile</h2></div><button v-if="isAdmin" class="text-button" @click="page = 'mods'">View all settings →</button></div>
              <dl class="profile-grid">
                <div><dt>Map chain</dt><dd>{{ overview.server.map }}</dd></div>
                <div><dt>Visibility</dt><dd>{{ overview.server.public ? 'Public listing' : 'Private' }}</dd></div>
                <div><dt>Join policy</dt><dd>{{ overview.config.open ? 'Open' : 'Whitelist only' }}</dd></div>
                <div><dt>Auto-save</dt><dd>Every {{ overview.config.saveMinutes }} minutes</dd></div>
                <div><dt>Startup backups</dt><dd>{{ overview.config.backupsOnStart ? 'Enabled' : 'Disabled' }}</dd></div>
                <div><dt>Deep telemetry</dt><dd>{{ telemetryStatusLabel }}</dd></div>
              </dl>
            </article>
            <article class="panel">
              <div class="panel-heading"><div><p class="eyebrow">Accountability</p><h2>Recent activity</h2></div><button class="text-button" @click="page = 'audit'">Full log →</button></div>
              <div v-if="!overview.recentAudit.length" class="empty-state compact-empty">No administrator actions recorded yet.</div>
              <ul v-else class="activity-list">
                <li v-for="entry in overview.recentAudit" :key="entry.id">
                  <span :class="['audit-mark', { failed: !entry.success }]">{{ entry.success ? '✓' : '!' }}</span>
                  <div><strong>{{ entry.action }}</strong><small>{{ entry.target || entry.category }}</small></div>
                  <time>{{ relativeTime(entry.at) }}</time>
                </li>
              </ul>
            </article>
          </div>
        </template>

        <template v-else-if="page === 'players'">
          <div class="section-intro">
            <div><p class="eyebrow">Live + historical</p><h2>Survivor registry</h2><p>Online state comes from RCON. Session totals are tracked by this dashboard from the moment it starts monitoring.</p></div>
            <div class="intro-stat"><strong>{{ onlinePlayers.length }}</strong><span>online now</span></div>
          </div>
          <ZomboidMap :players="overview.players" audience="admin" />
          <article class="panel survivor-panel">
            <div class="table-tabs"><span class="active">All survivors {{ overview.players.length }}</span><span>Online {{ onlinePlayers.length }}</span><span>Offline {{ offlinePlayers.length }}</span></div>
            <div v-if="!overview.players.length" class="empty-state"><strong>No survivors observed yet.</strong><span>The registry fills automatically as players connect.</span></div>
            <div v-else class="player-accordion" role="list">
              <article v-for="playerItem in overview.players" :key="playerItem.username" :class="['player-accordion-item', { expanded: expandedPlayerUsername === playerItem.username }]" role="listitem">
                <button
                  :id="`${playerPanelId(playerItem.username)}-trigger`"
                  type="button"
                  class="player-accordion-trigger"
                  :aria-expanded="expandedPlayerUsername === playerItem.username"
                  :aria-controls="playerPanelId(playerItem.username)"
                  @click="togglePlayer(playerItem.username)"
                >
                  <span class="accordion-player">
                    <span class="avatar">{{ playerItem.username.slice(0, 2).toUpperCase() }}</span>
                    <span><strong>{{ playerItem.username }}</strong><small>{{ playerItem.accessLevel || 'Player' }}</small></span>
                  </span>
                  <span class="accordion-status"><span :class="['status-chip', { online: playerItem.online }]"><span></span>{{ playerItem.online ? 'Online' : 'Offline' }}</span></span>
                  <span class="accordion-metric"><small>Sessions</small><strong>{{ playerItem.sessionCount }}</strong></span>
                  <span class="accordion-metric"><small>Observed</small><strong>{{ formatDuration(playerItem.totalOnlineSeconds) }}</strong></span>
                  <span class="accordion-metric accordion-last-seen"><small>Last seen</small><strong>{{ relativeTime(playerItem.lastSeenAt) }}</strong></span>
                  <span class="accordion-chevron" aria-hidden="true">⌄</span>
                </button>

                <section
                  v-if="expandedPlayerUsername === playerItem.username"
                  :id="playerPanelId(playerItem.username)"
                  class="player-accordion-content"
                  role="region"
                  :aria-labelledby="`${playerPanelId(playerItem.username)}-trigger`"
                >
                  <div class="player-detail-grid">
                    <div class="player-detail-column profile-column">
                      <div class="player-detail-heading"><div><p class="eyebrow">Survivor profile</p><h3>{{ playerItem.username }}</h3></div><span :class="['status-chip', { online: playerItem.online }]"><span></span>{{ playerItem.online ? 'Online now' : `Last seen ${relativeTime(playerItem.lastSeenAt)}` }}</span></div>
                      <div class="player-detail-stats"><div><strong>{{ playerItem.sessionCount }}</strong><span>sessions</span></div><div><strong>{{ formatDuration(playerItem.totalOnlineSeconds) }}</strong><span>observed</span></div><div><strong>{{ playerItem.telemetry?.zombieKills ?? '—' }}</strong><span>kills</span></div></div>
                      <section class="player-detail-section telemetry-section"><h3>Deep telemetry</h3><p v-if="!playerItem.telemetry">Vanilla RCON does not expose skills, health, inventory, position, or kill totals. These fields populate when the optional server telemetry exporter reports them.</p><template v-else><div class="telemetry-updated">Snapshot {{ relativeTime(playerItem.telemetry.updatedAt) }}</div><dl><div><dt>Health</dt><dd>{{ playerItem.telemetry.health !== undefined ? `${playerItem.telemetry.health.toFixed(1)}%` : '—' }}</dd></div><div><dt>Zombie kills</dt><dd>{{ playerItem.telemetry.zombieKills ?? '—' }}</dd></div><div><dt>Hours survived</dt><dd>{{ playerItem.telemetry.hoursSurvived !== undefined ? playerItem.telemetry.hoursSurvived.toFixed(1) : '—' }}</dd></div><div><dt>Profession</dt><dd>{{ playerItem.telemetry.profession ?? '—' }}</dd></div><div><dt>Carried weight</dt><dd>{{ playerItem.telemetry.inventoryWeight !== undefined ? playerItem.telemetry.inventoryWeight.toFixed(2) : '—' }}</dd></div><div><dt>Position</dt><dd>{{ playerItem.telemetry.position ? `${playerItem.telemetry.position.x.toFixed(1)}, ${playerItem.telemetry.position.y.toFixed(1)}, ${playerItem.telemetry.position.z.toFixed(1)}` : '—' }}</dd></div></dl><div v-if="playerItem.telemetry.traits?.length" class="telemetry-group"><h4>Traits</h4><div class="telemetry-chips"><span v-for="trait in playerItem.telemetry.traits" :key="trait">{{ trait }}</span></div></div><div class="telemetry-group"><h4>Developed skills</h4><div v-if="developedPerks(playerItem).length" class="perk-grid"><div v-for="([name, level]) in developedPerks(playerItem)" :key="name"><span>{{ name }}</span><strong>{{ level }}</strong></div></div><p v-else>No skill levels above zero were reported.</p></div></template></section>
                    </div>

                    <div class="player-detail-column admin-column">
                      <div class="player-detail-heading"><div><p class="eyebrow">RCON controls</p><h3>{{ isAdmin ? 'Administrator tools' : 'Moderator tools' }}</h3></div></div>
                      <template v-if="isAdmin">
                      <section class="player-detail-section"><h3>Abilities & events</h3><div class="ability-grid"><button :class="{ active: godModeEnabled[playerItem.username] }" :aria-pressed="Boolean(godModeEnabled[playerItem.username])" :disabled="busy.startsWith('player-')" @click="toggleGodMode(playerItem.username)">{{ godModeEnabled[playerItem.username] ? 'Disable god mode' : 'Enable god mode' }}</button><button :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'invisible')">Invisible</button><button :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'noclip')">No clip</button><button :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'lightning')">Lightning</button><button :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'horde', { count: hordeCount })">Horde × {{ hordeCount }}</button></div></section>
                      <section class="player-detail-section teleport-section">
                        <div class="teleport-heading">
                          <div><h3>Teleport</h3><p>Move this online survivor to exact world coordinates or to another connected survivor.</p></div>
                          <span :class="['teleport-ready', { online: playerItem.online }]">{{ playerItem.online ? 'READY' : 'OFFLINE' }}</span>
                        </div>
                        <div class="field-combo teleport-coordinate-combo">
                          <input v-model="teleportX" :aria-label="`Teleport X coordinate for ${playerItem.username}`" type="number" min="0" max="1000000" step="1" placeholder="X" />
                          <input v-model="teleportY" :aria-label="`Teleport Y coordinate for ${playerItem.username}`" type="number" min="0" max="1000000" step="1" placeholder="Y" />
                          <input v-model="teleportZ" :aria-label="`Teleport Z coordinate for ${playerItem.username}`" type="number" min="0" max="32" step="1" placeholder="Z" />
                          <button class="button outline" :disabled="busy.startsWith('player-') || !playerItem.online || !teleportX || !teleportY || teleportZ === ''" @click="playerAction(playerItem.username, 'teleport-coordinates', { x: teleportX, y: teleportY, z: teleportZ })">To coordinates</button>
                        </div>
                        <div class="field-combo teleport-player-combo">
                          <select v-model="teleportDestination" :aria-label="`Teleport destination survivor for ${playerItem.username}`">
                            <option value="" disabled>Choose online survivor</option>
                            <option v-for="destination in onlinePlayers.filter((player) => player.username !== playerItem.username)" :key="destination.username" :value="destination.username">{{ destination.username }}</option>
                          </select>
                          <button class="button outline" :disabled="busy.startsWith('player-') || !playerItem.online || !canTeleportToPlayer(playerItem.username)" @click="playerAction(playerItem.username, 'teleport-player', { destination: teleportDestination })">To survivor</button>
                        </div>
                        <small>{{ playerItem.online ? 'Coordinate format follows the server command: X, Y, Z. A confirmation is required.' : 'Teleporting requires the survivor to be connected.' }}</small>
                      </section>
                      <section class="player-detail-section"><h3>Items & XP</h3><div class="field-combo item-combo"><input v-model="itemName" :aria-label="`Item ID for ${playerItem.username}`" placeholder="Base.Axe" /><input v-model="itemCount" class="count-field" :aria-label="`Item count for ${playerItem.username}`" inputmode="numeric" /><button class="button outline" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'additem', { item: itemName, count: itemCount })">Give</button></div><div class="field-combo xp-combo"><select v-model="perkName" :aria-label="`XP skill for ${playerItem.username}`"><option v-for="perk in PLAYER_XP_PERKS" :key="perk.value" :value="perk.value">{{ perk.label }}</option></select><input v-model="xpAmount" class="count-field" :aria-label="`XP amount for ${playerItem.username}`" type="number" min="1" max="100000" step="1" /><button class="button outline" :disabled="busy.startsWith('player-') || !xpAmount" @click="playerAction(playerItem.username, 'addxp', { perk: perkName, amount: xpAmount })">Add XP</button></div></section>
                      <section class="player-detail-section vehicle-key-section">
                        <h3>Vehicle & key</h3>
                        <div class="field-combo"><input v-model="vehicleScript" :aria-label="`Vehicle script for ${playerItem.username}`" placeholder="Base.VanAmbulance" /><button class="button outline" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'vehicle', { script: vehicleScript })">Spawn vehicle</button></div>
                        <div v-if="observedVehicles.length" class="observed-vehicle-list" aria-label="Vehicle keys reported by telemetry">
                          <button v-for="vehicle in observedVehicles" :key="vehicle.keyId" type="button" :class="{ active: keyId === String(vehicle.keyId) }" @click="keyId = String(vehicle.keyId)">
                            <strong>{{ vehicle.script || 'Current vehicle' }}</strong>
                            <span>{{ vehicle.username }} · key #{{ vehicle.keyId }}</span>
                          </button>
                        </div>
                        <div class="field-combo key-combo"><input v-model="keyId" :aria-label="`Vehicle key ID for ${playerItem.username}`" type="number" min="0" step="1" placeholder="Vehicle key ID" /><input v-model="keyName" :aria-label="`Key name for ${playerItem.username}`" placeholder="Key name" /><button class="button outline" :disabled="busy.startsWith('player-') || !playerItem.online || !keyId" @click="playerAction(playerItem.username, 'key', { keyId, name: keyName })">Give key</button></div>
                        <small class="vehicle-key-help">The key ID belongs to one specific vehicle; it is not an item ID such as Base.CarKey. Have an online survivor sit in the target vehicle and its key ID will appear here after the next telemetry snapshot.</small>
                      </section>
                      </template>
                      <section class="player-detail-section danger-zone"><h3>Moderation</h3><input v-model="playerReason" :aria-label="`Moderation reason for ${playerItem.username}`" placeholder="Reason shown in logs" /><div><button class="button outline" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'kick', { reason: playerReason })">Kick</button><button class="button danger-button" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'ban', { reason: playerReason })">Ban survivor</button><button class="button outline" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'remove-whitelist')">Remove whitelist</button></div></section>
                    </div>
                  </div>
                </section>
              </article>
            </div>
          </article>
        </template>

        <template v-else-if="page === 'requests'">
          <div class="section-intro">
            <div><p class="eyebrow">Realtime user support</p><h2>Request queue</h2><p>Users can ask for help without receiving administrator commands. Claim requests, reply privately, and move each conversation through a visible resolution workflow.</p></div>
            <div class="intro-stat"><strong>{{ openSupportRequestCount }}</strong><span>waiting</span></div>
          </div>

          <div class="staff-request-layout">
            <section class="panel staff-request-list-panel">
              <div class="staff-request-toolbar">
                <div><button :class="{ active: requestFilter === 'active' }" @click="requestFilter = 'active'">Active</button><button :class="{ active: requestFilter === 'all' }" @click="requestFilter = 'all'">All</button></div>
                <span>{{ filteredSupportRequests.length }} requests</span>
              </div>
              <div v-if="!filteredSupportRequests.length" class="request-empty staff-empty"><span>✓</span><div><strong>Queue is clear</strong><p>New user requests will appear here automatically.</p></div></div>
              <div v-else class="staff-request-list">
                <button v-for="request in filteredSupportRequests" :key="request.id" type="button" :class="{ active: selectedRequestId === request.id }" @click="selectedRequestId = request.id">
                  <span class="request-category-mark">{{ supportRequestCategoryLabel(request.category).slice(0, 1) }}</span>
                  <span><small>{{ supportRequestCategoryLabel(request.category) }} · {{ relativeTime(request.updatedAt) }}</small><strong>{{ request.subject }}</strong><em>{{ request.createdBy }}</em></span>
                  <b :class="['request-status', request.status]">{{ supportRequestStatusLabel(request.status) }}</b>
                </button>
              </div>
            </section>

            <article v-if="selectedSupportRequest" class="panel staff-request-detail">
              <header>
                <div><p class="eyebrow">{{ supportRequestCategoryLabel(selectedSupportRequest.category) }}</p><h2>{{ selectedSupportRequest.subject }}</h2><p>Submitted by <strong>{{ selectedSupportRequest.createdBy }}</strong> · updated {{ relativeTime(selectedSupportRequest.updatedAt) }}</p></div>
                <b :class="['request-status', selectedSupportRequest.status]">{{ supportRequestStatusLabel(selectedSupportRequest.status) }}</b>
              </header>

              <p class="staff-request-description">{{ selectedSupportRequest.detail }}</p>
              <dl class="staff-request-meta">
                <div><dt>Requester</dt><dd>{{ selectedSupportRequest.createdBy }}</dd></div>
                <div><dt>Assigned staff</dt><dd>{{ selectedSupportRequest.claimedBy || 'Unclaimed' }}</dd></div>
                <div><dt>Related survivor</dt><dd>{{ selectedSupportRequest.targetUsername || 'None' }}</dd></div>
                <div><dt>Attached location</dt><dd>{{ supportRequestLocation(selectedSupportRequest) }}</dd></div>
              </dl>

              <div class="staff-request-actions">
                <button v-if="selectedSupportRequest.status === 'open'" class="button primary" :disabled="busy === `request-${selectedSupportRequest.id}`" @click="claimSupportRequest(selectedSupportRequest)">Claim request</button>
                <button v-if="['open', 'claimed'].includes(selectedSupportRequest.status)" class="button outline" :disabled="busy === `request-${selectedSupportRequest.id}`" @click="changeSupportRequestStatus(selectedSupportRequest, 'approved')">Approve</button>
                <button v-if="['open', 'claimed', 'approved'].includes(selectedSupportRequest.status)" class="button danger-button" :disabled="busy === `request-${selectedSupportRequest.id}`" @click="changeSupportRequestStatus(selectedSupportRequest, 'denied')">Deny</button>
                <button v-if="['claimed', 'approved'].includes(selectedSupportRequest.status)" class="button outline" :disabled="busy === `request-${selectedSupportRequest.id}`" @click="changeSupportRequestStatus(selectedSupportRequest, 'completed')">Complete</button>
                <button v-if="['denied', 'completed'].includes(selectedSupportRequest.status)" class="button outline" :disabled="busy === `request-${selectedSupportRequest.id}`" @click="changeSupportRequestStatus(selectedSupportRequest, 'open')">Reopen</button>
                <button class="button outline" @click="openRequestSurvivor(selectedSupportRequest)">Open survivor</button>
              </div>

              <section class="staff-request-conversation">
                <div class="player-request-heading"><div><p class="eyebrow">Private thread</p><h3>Conversation</h3></div><small>{{ selectedSupportRequest.messages.length }} replies</small></div>
                <div v-if="!selectedSupportRequest.messages.length" class="request-conversation-empty">No replies yet. Add a message before resolving the request when the user needs context.</div>
                <article v-for="message in selectedSupportRequest.messages" :key="message.id" :class="{ staff: message.authorRole !== 'user' }">
                  <div><strong>{{ message.author }}</strong><span>{{ message.authorRole }} · {{ relativeTime(message.at) }}</span></div><p>{{ message.body }}</p>
                </article>
                <form class="staff-request-reply" @submit.prevent="addStaffRequestMessage(selectedSupportRequest)">
                  <label for="staff-request-reply">Reply to {{ selectedSupportRequest.createdBy }}<textarea id="staff-request-reply" v-model="staffRequestReply" rows="4" maxlength="1000" placeholder="Add an update or ask for more information"></textarea></label>
                  <button class="button primary" :disabled="busy === `request-message-${selectedSupportRequest.id}` || !staffRequestReply.trim()">{{ busy === `request-message-${selectedSupportRequest.id}` ? 'Sending…' : 'Send reply' }}</button>
                </form>
              </section>
            </article>
            <article v-else class="panel staff-request-detail request-detail-empty"><span>←</span><div><strong>Select a request</strong><p>Choose a conversation from the queue to review its details.</p></div></article>
          </div>
        </template>

        <template v-else-if="page === 'users'">
          <div class="section-intro">
            <div><p class="eyebrow">Dashboard authorization</p><h2>Users and roles</h2><p>Every Project Zomboid account starts as a User. Moderators can review the dashboard and moderate survivors; Admins receive full server, world, settings, and RCON access.</p></div>
            <button class="button outline" :disabled="busy.startsWith('role-')" @click="loadDashboardUsers">Refresh users</button>
          </div>
          <article class="panel role-panel">
            <div class="role-legend"><span><b>User</b> Survivor portal only</span><span><b>Moderator</b> Overview and moderation</span><span><b>Admin</b> Full control</span></div>
            <div v-if="!dashboardUsers.length" class="empty-state"><strong>No dashboard users yet.</strong><span>Accounts appear after they sign in or after the server has observed their username.</span></div>
            <div v-else class="role-list">
              <article v-for="user in dashboardUsers" :key="user.username" class="role-row">
                <div class="role-identity"><span class="avatar">{{ user.username.slice(0, 2).toUpperCase() }}</span><div><strong>{{ user.username }}</strong><small>Last seen {{ relativeTime(user.lastSeenAt) }}<template v-if="user.roleUpdatedBy"> · changed by {{ user.roleUpdatedBy }}</template></small></div></div>
                <div class="role-buttons" :aria-label="`Dashboard role for ${user.username}`">
                  <button v-for="roleOption in dashboardRoleOptions" :key="roleOption" :class="{ active: user.role === roleOption }" :disabled="busy === `role-${user.username}`" @click="changeDashboardRole(user, roleOption)">{{ roleOption }}</button>
                </div>
              </article>
            </div>
          </article>
        </template>

        <template v-else-if="page === 'server'">
          <div class="section-intro">
            <div><p class="eyebrow">Server lifecycle</p><h2>Command center</h2><p>RCON handles live process commands. Starting a stopped instance, provider restarts, and provider backups remain with your hosting provider.</p></div>
            <a v-if="overview.integrations.providerUrl" class="button outline" :href="overview.integrations.providerUrl" target="_blank" rel="noreferrer">Open {{ overview.integrations.providerName }} ↗</a>
          </div>
          <div class="command-grid">
            <article v-for="command in serverCommands" :key="command.id" :class="['command-card', command.impact]">
              <div class="command-symbol">{{ command.impact === 'danger' ? '!' : command.category === 'maintenance' ? '◫' : '◆' }}</div>
              <div><h3>{{ command.label }}</h3><p>{{ command.description }}</p><code>{{ command.command }}</code></div>
              <button :class="['button', command.impact === 'danger' ? 'danger-button' : 'outline']" :disabled="busy === command.id" @click="runCommand(command.id)">{{ busy === command.id ? 'Working…' : 'Run' }}</button>
            </article>
          </div>
          <article class="panel warning-panel">
            <div class="warning-icon">!</div><div><strong>Provider boundary</strong><p>RCON can stop the game process with a safe save-first shutdown, but it cannot start a stopped hosted instance. The dashboard intentionally never stores your hosting-provider account password.</p></div>
          </article>
        </template>

        <template v-else-if="page === 'world'">
          <div class="section-intro"><div><p class="eyebrow">Live world interventions</p><h2>World director</h2><p>Trigger ambient events and zombie interventions supported by this live Build 42 server. These actions affect everyone currently playing.</p></div></div>
          <div class="world-layout">
            <section>
              <h3 class="section-label">Build 42 world commands</h3>
              <div class="command-grid compact-grid">
                <article v-for="worldCommand in worldCommands.filter((item) => item.category === 'world' && !item.args?.length)" :key="worldCommand.id" :class="['command-card', worldCommand.impact]">
                  <div class="command-symbol">{{ worldCommand.impact === 'danger' ? '!' : '◉' }}</div><div><h3>{{ worldCommand.label }}</h3><p>{{ worldCommand.description }}</p></div>
                  <button :class="['button', worldCommand.impact === 'danger' ? 'danger-button' : 'outline']" :disabled="busy === worldCommand.id" @click="runCommand(worldCommand.id)">Trigger</button>
                </article>
              </div>
            </section>
            <aside class="panel coordinate-panel">
              <p class="eyebrow">Targeted event</p><h2>Choose a survivor</h2><p>Build 42 RCON targets lightning and horde events by online username.</p>
              <label>Username<input v-model="worldTarget" list="online-usernames" placeholder="Exact online username" /></label>
              <datalist id="online-usernames"><option v-for="playerItem in onlinePlayers" :key="playerItem.username" :value="playerItem.username"></option></datalist>
              <label>Horde size<input v-model="hordeCount" inputmode="numeric" /></label>
              <button class="button primary full" :disabled="!worldTarget.trim()" @click="runCommand('lightning', { username: worldTarget })">Trigger lightning</button>
              <button class="button danger-button full" :disabled="!worldTarget.trim()" @click="runCommand('create-horde', { username: worldTarget, count: hordeCount })">Create horde nearby</button>
              <small>The current live server help requires a username for console-originated events.</small>
            </aside>
          </div>
        </template>

        <template v-else-if="page === 'settings'">
          <div class="section-intro">
            <div><p class="eyebrow">Admin-only runtime controls</p><h2>Live server settings</h2><p>These allowlisted options are applied immediately through RCON. The dashboard does not edit SandboxVars, change mods, reload options, or restart the server.</p></div>
            <button class="button outline" :disabled="busy.startsWith('setting-')" @click="loadLiveSettings">Refresh live values</button>
          </div>
          <div class="live-settings-status">
            <span :class="['status-dot', { live: overview.connection.connected }]"></span>
            <strong>{{ overview.connection.connected ? 'RCON ready' : 'RCON unavailable' }}</strong>
            <small v-if="liveSettingsRefreshedAt">Checked {{ relativeTime(liveSettingsRefreshedAt) }}</small>
            <b>NO RESTART REQUIRED</b>
          </div>
          <p v-if="liveSettingsWarning" class="settings-warning" role="status">{{ liveSettingsWarning }}</p>
          <div class="live-settings-groups">
            <article v-for="group in liveSettingCategories" :key="group.category" class="panel live-settings-group">
              <div class="panel-heading"><div><p class="eyebrow">Runtime ServerOption</p><h2>{{ group.category }}</h2></div><span>{{ group.settings.length }} controls</span></div>
              <div class="live-setting-list">
                <div v-for="setting in group.settings" :key="setting.key" class="live-setting-row">
                  <div class="live-setting-copy"><strong>{{ setting.label }}</strong><p>{{ setting.description }}</p><code>{{ liveSettingMeta(setting) }}</code><small v-if="setting.requiresPlayerReconnect" class="reconnect-note">Player reconnect required</small></div>
                  <button
                    v-if="setting.kind === 'boolean'"
                    type="button"
                    :class="['setting-toggle', { active: Boolean(liveSettingDrafts[setting.key]) }]"
                    :aria-pressed="Boolean(liveSettingDrafts[setting.key])"
                    :disabled="!overview.connection.connected || busy === `setting-${setting.key}`"
                    @click="changeLiveSetting(setting, !Boolean(liveSettingDrafts[setting.key]))"
                  ><span></span>{{ Boolean(liveSettingDrafts[setting.key]) ? 'Enabled' : 'Disabled' }}</button>
                  <div v-else class="live-number-control">
                    <input v-model="liveSettingDrafts[setting.key]" type="number" :min="setting.min" :max="setting.max" :step="setting.step ?? 1" :aria-label="setting.label" />
                    <button class="button outline compact" :disabled="!overview.connection.connected || busy === `setting-${setting.key}` || liveSettingDrafts[setting.key] === ''" @click="changeLiveSetting(setting, liveSettingDrafts[setting.key])">Apply</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </template>

        <template v-else-if="page === 'mods'">
          <div class="section-intro"><div><p class="eyebrow">Read-only source of truth</p><h2>Mods & configuration</h2><p>Imported server values are searchable here. Passwords, tokens, and webhooks are always removed before data reaches the browser.</p></div><span :class="['source-badge', { live: overview.integrations.configFile }]">{{ overview.integrations.configFile ? 'INI CONNECTED' : 'NO CONFIG FILE' }}</span></div>
          <div class="integration-grid">
            <article class="integration-card"><span class="integration-icon">M</span><div><strong>{{ overview.config.mods.length }} mod IDs</strong><small>Project Zomboid load order</small></div></article>
            <article class="integration-card"><span class="integration-icon">W</span><div><strong>{{ overview.config.workshopItems.length }} Workshop items</strong><small>Steam subscriptions</small></div></article>
            <article class="integration-card"><span class="integration-icon">T</span><div><strong>{{ telemetryStatusLabel }}</strong><small>{{ telemetryStatusDetail }}</small></div></article>
          </div>
          <article id="mods-panel" class="panel config-panel">
            <div class="config-toolbar"><div class="config-tabs"><button class="active" @click="scrollToId('mods-panel')">Mods</button><button @click="scrollToId('settings-panel')">Jump to settings ↓</button></div><input v-model="modSearch" class="search-input" placeholder="Filter mod ID or Workshop number" /></div>
            <div class="mod-columns">
              <section><h3>Mod IDs <span>{{ filteredMods.length }}</span></h3><ul class="code-list"><li v-for="mod in filteredMods" :key="mod"><code>{{ mod }}</code></li></ul></section>
              <section><h3>Workshop items <span>{{ filteredWorkshop.length }}</span></h3><ul class="code-list"><li v-for="item in filteredWorkshop" :key="item"><code>{{ item }}</code><a :href="`https://steamcommunity.com/sharedfiles/filedetails/?id=${item}`" target="_blank" rel="noreferrer">↗</a></li></ul></section>
            </div>
          </article>
          <article id="settings-panel" class="panel settings-panel">
            <div class="panel-heading"><div><p class="eyebrow">INI + SandboxVars</p><h2>Search all safe settings</h2></div><input v-model="settingsSearch" class="search-input" placeholder="PVP, loot, zombies..." /></div>
            <div class="settings-grid">
              <div v-for="([key, value]) in filteredSettings.slice(0, 300)" :key="key"><code>{{ key }}</code><strong>{{ value }}</strong></div>
            </div>
            <p v-if="filteredSettings.length > 300" class="list-note">Showing the first 300 of {{ filteredSettings.length }} matches. Refine your search to narrow the list.</p>
          </article>
        </template>

        <template v-else-if="page === 'console'">
          <div class="section-intro"><div><p class="eyebrow">Unrestricted administrator surface</p><h2>RCON console</h2><p>Run any command supported by the current Project Zomboid build. Every command is audited; secret-bearing commands are redacted in history.</p></div><span class="source-badge danger-source">FULL ACCESS</span></div>
          <article class="console-panel">
            <div class="console-top"><span></span><span></span><span></span><strong>rcon@{{ overview.server.name.toLowerCase().replace(/\s+/g, '-') }}</strong><small>{{ modeLabel }}</small></div>
            <div class="console-output" aria-live="polite">
              <div v-if="!consoleLines.length" class="console-welcome"><strong>Project Zomboid Remote Console</strong><span>Enter <code>help</code> to inspect commands available in the running server build.</span></div>
              <div v-for="(line, index) in consoleLines" :key="`${line.at}-${index}`" :class="['console-entry', { error: line.error }]">
                <div><time>{{ new Date(line.at).toLocaleTimeString() }}</time><span>&gt;</span><code>{{ line.command }}</code></div>
                <pre>{{ line.output }}</pre>
              </div>
            </div>
            <form class="console-form" @submit.prevent="executeConsole">
              <span>&gt;</span><input v-model="consoleCommand" autocomplete="off" spellcheck="false" placeholder="help" /><button :disabled="busy === 'console'">Run</button>
            </form>
            <div class="console-confirm"><label>High-impact confirmation<input v-model="consoleConfirm" placeholder="Type EXECUTE when requested" /></label><small>Required for raw quit, removezombies, and ban commands.</small></div>
          </article>
        </template>

        <template v-else-if="page === 'audit'">
          <div class="section-intro"><div><p class="eyebrow">Local administrator history</p><h2>Audit log</h2><p>Actions are recorded locally with timestamps, targets, outcomes, and redacted command text.</p></div><button class="button outline" @click="loadAll()">Refresh log</button></div>
          <article class="panel table-panel">
            <div v-if="!audit.length" class="empty-state">No actions recorded yet.</div>
            <div v-else class="data-table-wrap"><table class="data-table audit-table"><thead><tr><th>Time</th><th>Result</th><th>Category</th><th>Action</th><th>Target / command</th></tr></thead><tbody><tr v-for="entry in audit" :key="entry.id"><td>{{ new Date(entry.at).toLocaleString() }}</td><td><span :class="['result-chip', { failed: !entry.success }]">{{ entry.success ? 'SUCCESS' : 'FAILED' }}</span></td><td>{{ entry.category }}</td><td><strong>{{ entry.action }}</strong></td><td><code>{{ entry.target || entry.command || entry.detail || '—' }}</code></td></tr></tbody></table></div>
          </article>
        </template>
      </section>
    </div>

    <transition name="toast"><div v-if="toast" :class="['toast', { error: toast.error }]" role="status"><span>{{ toast.error ? '!' : '✓' }}</span>{{ toast.message }}</div></transition>
  </div>
</template>
