<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AuditEntry, CommandDefinition, DashboardRole, DashboardSession, DashboardUser, LiveSettingCategory, LiveSettingsSnapshot, LiveSettingState, Overview, PlayerPortalCommunity, PlayerRecord, PlayerSettings, PlayerTheme, SandboxSettingsSnapshot, SandboxSettingState, SetupStatus, SupportRequest, SupportRequestCategory, SupportRequestStatus } from '@shared/types'
import { activeSupportRequestStatuses, supportRequestCategories } from '@shared/support-requests'
import { PLAYER_XP_PERKS } from '@shared/perks'
import { isBootstrapAdminPath, isStaffConsolePath, PLAYER_PORTAL_PATH } from '@shared/routes'
import { activityChartScale } from './activity-chart'
import { api, ApiError, formatDuration, relativeTime } from './helpers'
import ConfigurationEditor from './ConfigurationEditor.vue'
import PlayerPortal from './PlayerPortal.vue'
import SetupView from './SetupView.vue'
import ZomboidMap from './ZomboidMap.vue'

type Page = 'overview' | 'players' | 'requests' | 'users' | 'configuration' | 'server' | 'world' | 'settings' | 'sandbox' | 'mods' | 'console' | 'audit'
type AbilityKey = 'godMode' | 'invisible' | 'noClip'
const adminConsoleMode = isStaffConsolePath(window.location.pathname)
const bootstrapAdminMode = isBootstrapAdminPath(window.location.pathname)
const setupMode = ref(window.location.pathname === '/setup')
const setupChecking = ref(true)
const setupStatus = ref<SetupStatus | null>(null)
document.title = setupMode.value ? 'PZ RCON Admin // Secure Setup' : adminConsoleMode ? 'Project Zomboid // Server Control' : 'Project Zomboid // Survivor Network'

const allNavItems: Array<{ id: Page; label: string; icon: string; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'players', label: 'Survivors', icon: 'users' },
  { id: 'requests', label: 'Request queue', icon: 'list' },
  { id: 'users', label: 'Dashboard users', icon: 'users', adminOnly: true },
  { id: 'configuration', label: 'Configuration', icon: 'sliders', adminOnly: true },
  { id: 'server', label: 'Server control', icon: 'server', adminOnly: true },
  { id: 'world', label: 'World director', icon: 'world', adminOnly: true },
  { id: 'settings', label: 'Live settings', icon: 'sliders', adminOnly: true },
  { id: 'sandbox', label: 'Sandbox live', icon: 'sliders', adminOnly: true },
  { id: 'mods', label: 'Mods & config', icon: 'sliders', adminOnly: true },
  { id: 'console', label: 'RCON console', icon: 'terminal', adminOnly: true },
  { id: 'audit', label: 'Audit log', icon: 'list', adminOnly: true },
]
const dashboardRoleOptions: DashboardRole[] = ['user', 'moderator', 'admin']
const defaultInGameRoleOptions = ['priority', 'observer', 'gm', 'moderator', 'admin']
const abilityOptions: Array<{ key: AbilityKey; label: string }> = [
  { key: 'godMode', label: 'God mode' },
  { key: 'invisible', label: 'Invisible' },
  { key: 'noClip', label: 'No clip' },
]

const page = ref<Page>('overview')
const loading = ref(true)
const sessionError = ref('')
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
const sandboxSettings = ref<SandboxSettingState[]>([])
const sandboxSettingDrafts = ref<Record<string, string | boolean>>({})
const sandboxSettingsConfigured = ref(false)
const sandboxSettingsWarning = ref('')
const sandboxSettingsRefreshedAt = ref('')
const sandboxLiveSearch = ref('')
const supportRequests = ref<SupportRequest[]>([])
const selectedRequestId = ref<string | null>(null)
const requestDialogOpen = ref(false)
const requestDialog = ref<HTMLElement | null>(null)
const requestFilter = ref<'active' | 'all'>('active')
const staffRequestReply = ref('')
const sandbox = ref<Record<string, string | number | boolean>>({})
const expandedPlayerUsername = ref<string | null>(null)
const toast = ref<{ message: string; error?: boolean } | null>(null)
const busy = ref('')
const announcement = ref('')
const worldTarget = ref('')
const hordeCount = ref('25')
const rainIntensity = ref('50')
const stormDuration = ref('24')
const zombieClearX = ref('')
const zombieClearY = ref('')
const zombieClearZ = ref('0')
const zombieClearRadius = ref('100')
const playerReasons = ref<Record<string, string>>({})
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
const consoleLines = ref<Array<{ id: number; at: string; command: string; output: string; error?: boolean }>>([])
let consoleLineId = 0
const abilityOverrides = ref<Record<string, Partial<Record<AbilityKey, { enabled: boolean; observedAt?: string }>>>>({})
const playerRoleDrafts = ref<Record<string, string>>({})
let refreshTimer: number | undefined
let toastTimer: number | undefined
let pendingRequestDeepLink = new URLSearchParams(window.location.search).get('request')?.trim().slice(0, 128) || undefined

const isAdmin = computed(() => sessionRole.value === 'admin')
const inGameRoleOptions = computed(() => {
  const reported = overview.value?.integrations.gameRoles ?? []
  const current = overview.value?.players.map((player) => player.accessLevel ?? '') ?? []
  const candidates = reported.length ? [...reported, ...current] : [...defaultInGameRoleOptions, ...current]
  const roles = new Map<string, string>()
  for (const role of candidates) {
    const normalized = role.trim()
    if (!normalized || ['banned', 'user', 'none'].includes(normalized.toLowerCase())) continue
    if (!roles.has(normalized.toLowerCase())) roles.set(normalized.toLowerCase(), normalized)
  }
  return ['none', ...roles.values()]
})
const navItems = computed(() => allNavItems.filter((item) => !item.adminOnly || isAdmin.value))
const brandName = computed(() => community.value.name)
const brandInitials = computed(() => community.value.initials)
const brandTagline = computed(() => community.value.tagline)

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
  if (!session.authenticated && !bootstrapAdminMode) {
    window.location.replace(PLAYER_PORTAL_PATH)
    return
  }
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
  try {
    await api('/api/logout', { method: 'POST', body: '{}' })
    window.location.replace(PLAYER_PORTAL_PATH)
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Sign out failed', true)
  }
}

function goToPlayerPortal() {
  window.location.assign(PLAYER_PORTAL_PATH)
}

let loadAllSequence = 0

async function loadAll(silent = false) {
  const sequence = ++loadAllSequence
  try {
    const [nextOverview, nextCommands, nextAudit, config, nextRequests] = await Promise.all([
      api<Overview>('/api/overview'),
      !isAdmin.value || commands.value.length ? Promise.resolve(commands.value) : api<CommandDefinition[]>('/api/commands'),
      !isAdmin.value
        ? Promise.resolve([])
        : page.value === 'audit' || !audit.value.length
          ? api<AuditEntry[]>('/api/audit?limit=200')
          : Promise.resolve(audit.value),
      !isAdmin.value || Object.keys(sandbox.value).length ? Promise.resolve({ sandbox: sandbox.value }) : api<{ sandbox: Record<string, string | number | boolean> }>('/api/config'),
      api<SupportRequest[]>('/api/requests'),
    ])
    // A slower older refresh must not clobber the state a newer one wrote.
    if (sequence !== loadAllSequence) return
    for (const player of nextOverview.players) {
      const overrides = abilityOverrides.value[player.username]
      if (!overrides) continue
      for (const key of Object.keys(overrides) as AbilityKey[]) {
        if (player.telemetry?.updatedAt && player.telemetry.updatedAt !== overrides[key]?.observedAt) delete overrides[key]
      }
    }
    overview.value = nextOverview
    community.value = nextOverview.community
    commands.value = nextCommands
    audit.value = nextAudit
    sandbox.value = config.sandbox
    supportRequests.value = nextRequests
    if (pendingRequestDeepLink) {
      const linkedRequest = nextRequests.find((request) => request.id === pendingRequestDeepLink)
      if (linkedRequest) {
        page.value = 'requests'
        requestFilter.value = 'all'
        selectedRequestId.value = linkedRequest.id
        requestDialogOpen.value = true
        await nextTick()
        requestDialog.value?.focus()
      } else {
        notify('The linked support request could not be found.', true)
        clearRequestDeepLink()
      }
      pendingRequestDeepLink = undefined
    } else if (!selectedRequestId.value && nextRequests.length) {
      selectedRequestId.value = nextRequests.find((request) => activeSupportRequestStatuses.includes(request.status))?.id ?? nextRequests[0].id
    }
  } catch (error) {
    // The 12-hour session cookie can expire while the console is open;
    // fall back to the sign-in flow instead of polling 401s forever.
    if (error instanceof ApiError && error.status === 401 && authenticated.value) {
      authenticated.value = false
      if (!bootstrapAdminMode) window.location.replace(PLAYER_PORTAL_PATH)
      return
    }
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
  closeRequestDialog()
  page.value = 'players'
  expandedPlayerUsername.value = request.createdBy
}

function clearRequestDeepLink() {
  const url = new URL(window.location.href)
  url.searchParams.delete('request')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function closeRequestDialog() {
  requestDialogOpen.value = false
  clearRequestDeepLink()
}

function handleRequestDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && requestDialogOpen.value) closeRequestDialog()
}

function navCount(item: { id: Page }): number {
  if (item.id === 'players') return onlinePlayers.value.length
  if (item.id === 'requests') return openSupportRequestCount.value
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
  const warning = user.username === sessionUsername.value
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
    if (updated.username === sessionUsername.value) await loadSession()
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Role change failed', true)
  } finally {
    busy.value = ''
  }
}

async function removeDashboardPlayer(player: PlayerRecord) {
  if (player.online) {
    notify('Online survivors cannot be removed from the dashboard', true)
    return
  }
  const confirmation = window.prompt(
    `Remove ${player.username} from the dashboard?\n\nThis deletes local survivor history, telemetry, dashboard role, and theme only. It does not ban the player, remove their whitelist entry, or delete game data. The account will reappear if it signs in or is observed again.\n\nType the exact username to continue:`,
  )
  if (confirmation !== player.username) {
    if (confirmation !== null) notify(`Confirmation must equal ${player.username}`, true)
    return
  }
  busy.value = `remove-dashboard-${player.username}`
  try {
    await api(`/api/admin/players/${encodeURIComponent(player.username)}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: player.username }),
    })
    if (overview.value) overview.value.players = overview.value.players.filter((item) => item.username !== player.username)
    dashboardUsers.value = dashboardUsers.value.filter((user) => user.username !== player.username)
    delete abilityOverrides.value[player.username]
    delete playerRoleDrafts.value[player.username]
    delete playerReasons.value[player.username]
    if (expandedPlayerUsername.value === player.username) expandedPlayerUsername.value = null
    notify(`${player.username} was removed from the dashboard`)
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Dashboard removal failed', true)
  } finally {
    busy.value = ''
  }
}

function liveSettingDraftValue(setting: LiveSettingState): string | boolean {
  return setting.kind === 'boolean' ? Boolean(setting.value) : setting.value === undefined ? '' : String(setting.value)
}

function sandboxSettingDraftValue(setting: SandboxSettingState): string | boolean {
  return setting.kind === 'boolean' ? Boolean(setting.value) : String(setting.value)
}

async function loadLiveSettings() {
  if (!isAdmin.value) return
  try {
    const snapshot = await api<LiveSettingsSnapshot>('/api/admin/live-settings')
    liveSettings.value = snapshot.settings
    liveSettingsWarning.value = snapshot.warning ?? ''
    liveSettingsRefreshedAt.value = snapshot.refreshedAt
    liveSettingDrafts.value = Object.fromEntries(snapshot.settings.map((setting) => [setting.key, liveSettingDraftValue(setting)]))
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not load live settings', true)
  }
}

async function changeLiveSetting(setting: LiveSettingState, value: string | boolean) {
  if (setting.impact === 'caution' && !window.confirm(`${setting.label}\n\n${setting.description}\n\nApply this immediately to the running server?`)) {
    liveSettingDrafts.value[setting.key] = liveSettingDraftValue(setting)
    return
  }
  busy.value = `setting-${setting.key}`
  try {
    const result = await api<{ setting: LiveSettingState; output: string }>(`/api/admin/live-settings/${encodeURIComponent(setting.key)}`, {
      method: 'PATCH',
      body: JSON.stringify({ value, confirm: setting.impact === 'caution' ? setting.key : undefined }),
    })
    liveSettings.value = liveSettings.value.map((item) => item.key === setting.key ? result.setting : item)
    liveSettingDrafts.value[setting.key] = liveSettingDraftValue(result.setting)
    notify(`${result.setting.label} updated live${result.setting.requiresPlayerReconnect ? ' — players must reconnect to refresh it' : ''}`)
    await loadAll(true)
  } catch (error) {
    liveSettingDrafts.value[setting.key] = liveSettingDraftValue(setting)
    notify(error instanceof Error ? error.message : 'Live setting change failed', true)
  } finally {
    busy.value = ''
  }
}

async function loadSandboxSettings() {
  if (!isAdmin.value) return
  try {
    const snapshot = await api<SandboxSettingsSnapshot>('/api/admin/sandbox-settings')
    sandboxSettings.value = snapshot.settings
    sandboxSettingsConfigured.value = snapshot.configured
    sandboxSettingsWarning.value = snapshot.warning ?? ''
    sandboxSettingsRefreshedAt.value = snapshot.refreshedAt
    sandboxSettingDrafts.value = Object.fromEntries(snapshot.settings.map((setting) => [setting.key, sandboxSettingDraftValue(setting)]))
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not load SandboxVars controls', true)
  }
}

async function changeSandboxSetting(setting: SandboxSettingState) {
  if (!window.confirm(`${setting.option}\n\nCurrent value: ${setting.value}\nNew value: ${sandboxSettingDrafts.value[setting.key]}\n\nApply this to the running world and save SandboxVars.lua?`)) return
  busy.value = `sandbox-${setting.key}`
  try {
    const result = await api<{ setting: SandboxSettingState; message: string }>(`/api/admin/sandbox-settings/${encodeURIComponent(setting.key)}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: sandboxSettingDrafts.value[setting.key], confirm: setting.key }),
    })
    sandboxSettings.value = sandboxSettings.value.map((entry) => entry.key === setting.key ? result.setting : entry)
    sandboxSettingDrafts.value[setting.key] = sandboxSettingDraftValue(result.setting)
    sandbox.value[result.setting.key] = result.setting.value
    notify(`${result.setting.option} updated live and saved`)
    await loadAll(true)
  } catch (error) {
    sandboxSettingDrafts.value[setting.key] = sandboxSettingDraftValue(setting)
    notify(error instanceof Error ? error.message : 'SandboxVars change failed', true)
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
    const result = await api<{ output: string; command: string }>(`/api/commands/${id}`, {
      method: 'POST',
      body: JSON.stringify({ args, confirm: definition.impact === 'danger' ? id : undefined }),
    })
    notify(`${definition.label} completed`)
    consoleLines.value.unshift({ id: ++consoleLineId, at: new Date().toISOString(), command: result.command, output: result.output })
    if (id === 'announce') announcement.value = ''
    await loadAll(true)
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Command failed', true)
  } finally {
    busy.value = ''
  }
}

function useWorldTargetPosition() {
  const target = onlinePlayers.value.find((player) => player.username === worldTarget.value.trim())
  const position = target?.telemetry?.position
  if (!position) {
    notify('No telemetry position is available for that online survivor', true)
    return
  }
  zombieClearX.value = String(Math.floor(position.x))
  zombieClearY.value = String(Math.floor(position.y))
  zombieClearZ.value = String(Math.floor(position.z))
  notify(`Zombie-clear coordinates copied from ${target.username}`)
}

async function playerAction(username: string, action: string, payload: Record<string, unknown> = {}) {
  if (['kick', 'ban', 'remove-whitelist'].includes(action) && !window.confirm(`${action === 'ban' ? 'Ban' : action === 'kick' ? 'Kick' : 'Remove from whitelist'} ${username}?`)) return false
  if (action === 'teleport-coordinates' && !window.confirm(`Teleport ${username} to ${payload.x}, ${payload.y}, z${payload.z}?\n\nMake sure the destination is safe and loaded.`)) return false
  if (action === 'teleport-player' && !window.confirm(`Teleport ${username} to ${payload.destination}?`)) return false
  if (action === 'access-level' && !window.confirm(`Change ${username}'s in-game Project Zomboid role to ${payload.level}?\n\nThis is separate from dashboard access and may grant powerful in-game capabilities.`)) return false
  if (action === 'clear-map-symbols' && !window.confirm(`Permanently remove all map symbols for ${username}?`)) return false
  busy.value = `player-${action}`
  try {
    const result = await api<{ output: string; teleportMethod?: 'coordinates' | 'player' }>(`/api/players/${encodeURIComponent(username)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, payload, confirm: ['ban', 'teleport-coordinates', 'teleport-player', 'access-level', 'clear-map-symbols'].includes(action) ? username : undefined }),
    })
    if (['godmode', 'invisible', 'noclip'].includes(action)) {
      notify(`${action === 'godmode' ? 'God mode' : action === 'invisible' ? 'Invisible' : 'No clip'} ${payload.enabled === false ? 'disabled' : 'enabled'} for ${username}`)
    } else if (action === 'access-level') {
      notify(`${username}'s in-game role is now ${payload.level}`)
    } else if (action === 'voiceban') {
      notify(`${username}'s voice access ${payload.enabled === false ? 'restored' : 'blocked'}`)
    } else if (action === 'addxp') {
      const perk = PLAYER_XP_PERKS.find((item) => item.value === payload.perk)
      notify(`${payload.amount} ${perk?.label ?? payload.perk} XP granted to ${username}`)
    } else if (action === 'teleport-coordinates') {
      notify(`${username} teleported to ${payload.x}, ${payload.y}, z${payload.z}`)
    } else if (action === 'teleport-player') {
      notify(result.teleportMethod === 'coordinates'
        ? `${username} teleported to ${payload.destination}'s latest tracked position`
        : `${username} teleported to ${payload.destination}`)
    } else {
      notify(`${action} command completed for ${username}`)
    }
    if (['kick', 'ban', 'remove-whitelist'].includes(action)) playerReasons.value[username] = ''
    consoleLines.value.unshift({ id: ++consoleLineId, at: new Date().toISOString(), command: `${action} ${username}`, output: result.output })
    await loadAll(true)
    return true
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Player command failed', true)
    return false
  } finally {
    busy.value = ''
  }
}

function abilityEnabled(player: PlayerRecord, key: AbilityKey): boolean {
  return abilityOverrides.value[player.username]?.[key]?.enabled ?? Boolean(player.telemetry?.abilities?.[key])
}

async function toggleAbility(player: PlayerRecord, key: AbilityKey) {
  const action = key === 'godMode' ? 'godmode' : key === 'noClip' ? 'noclip' : 'invisible'
  const enabled = !abilityEnabled(player, key)
  if (await playerAction(player.username, action, { enabled })) {
    abilityOverrides.value[player.username] ??= {}
    abilityOverrides.value[player.username][key] = { enabled, observedAt: player.telemetry?.updatedAt }
  }
}

function setPlayerRoleDraft(username: string, event: Event) {
  playerRoleDrafts.value[username] = (event.target as HTMLSelectElement).value
}

function playerInGameRole(player: PlayerRecord): string {
  const accessLevel = player.accessLevel?.trim()
  if (!accessLevel || ['user', 'none'].includes(accessLevel.toLowerCase())) return 'none'
  return inGameRoleOptions.value.find((role) => role.toLowerCase() === accessLevel.toLowerCase()) ?? accessLevel
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
  const source = username
  const destination = teleportDestination.value
  return Boolean(destination) && onlinePlayers.value.some((player) => (
    player.username === destination
    && player.username !== source
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
    consoleLines.value.unshift({ id: ++consoleLineId, at: new Date().toISOString(), command, output: result.output })
    consoleCommand.value = ''
    consoleConfirm.value = ''
    notify('Command executed')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed'
    consoleLines.value.unshift({ id: ++consoleLineId, at: new Date().toISOString(), command, output: message, error: true })
    notify(message, true)
  } finally {
    busy.value = ''
  }
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
const serverVersionLabel = computed(() => {
  if (overview.value?.server.serverVersion) return overview.value.server.serverVersion
  const integration = overview.value?.integrations
  if (!integration || integration.telemetrySource === 'none') return 'Telemetry not configured'
  return integration.telemetryConnected ? 'Not reported by companion' : 'Waiting for telemetry'
})
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
const chartMaximum = computed(() => activityChartScale(
  overview.value?.server.maxPlayers ?? 0,
  overview.value?.activity.slice(-48).map((point) => point.online) ?? [],
))
const chartPoints = computed(() => {
  const points = overview.value?.activity.slice(-48) ?? []
  if (!points.length) return '0,100 600,100'
  return points.map((point, index) => {
    const x = points.length === 1 ? 600 : index * (600 / (points.length - 1))
    const y = 100 - (point.online / chartMaximum.value) * 82
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
const sandboxSettingCategories = computed(() => {
  const query = sandboxLiveSearch.value.trim().toLowerCase()
  const filtered = sandboxSettings.value.filter((setting) => !query || `${setting.option} ${setting.label} ${setting.value}`.toLowerCase().includes(query))
  const categories = [...new Set(filtered.map((setting) => setting.category))]
  return categories.map((category) => ({ category, settings: filtered.filter((setting) => setting.category === category) }))
})

watch(page, (nextPage) => {
  if (nextPage !== 'requests' && requestDialogOpen.value) closeRequestDialog()
  if (nextPage === 'users') void loadDashboardUsers()
  if (nextPage === 'settings') void loadLiveSettings()
  if (nextPage === 'sandbox') void loadSandboxSettings()
  if (nextPage === 'audit') void loadAll(true)
})

async function startSession() {
  sessionError.value = ''
  loading.value = true
  try {
    await loadSession()
  } catch (error) {
    // Without this the console would sit on the splash screen forever.
    sessionError.value = error instanceof Error ? error.message : 'The dashboard could not be reached'
    loading.value = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleRequestDialogKeydown)
  try {
    setupStatus.value = await api<SetupStatus>('/api/setup/status')
    setupMode.value = setupMode.value || setupStatus.value.required
    if (setupMode.value) document.title = 'PZ RCON Admin // Secure Setup'
  } catch {
    // If the setup check fails the session check below reports the outage.
  } finally {
    setupChecking.value = false
  }
  if (setupMode.value) return
  if (!adminConsoleMode) return
  await startSession()
  refreshTimer = window.setInterval(() => {
    if (authenticated.value) void loadAll(true)
  }, 10_000)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleRequestDialogKeydown)
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

  <div v-else-if="sessionError" class="splash">
    <div class="splash-mark">PZ</div>
    <p>{{ sessionError }}</p>
    <button class="button outline" type="button" @click="startSession">Try again</button>
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

      <nav aria-label="Staff console sections">
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
              <p>RCON polling every {{ overview.connection.pollSeconds }} seconds</p>
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
                <div class="chart-y"><span>{{ chartMaximum }}</span><span>{{ chartMaximum / 2 }}</span><span>0</span></div>
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
                <div><dt>Project Zomboid build</dt><dd>{{ serverVersionLabel }}</dd></div>
                <div><dt>Visibility</dt><dd>{{ overview.server.public ? 'Public listing' : 'Private' }}</dd></div>
                <div><dt>Join policy</dt><dd>{{ overview.config.open ? 'Open' : 'Whitelist only' }}</dd></div>
                <div><dt>Auto-save</dt><dd>Every {{ overview.config.saveMinutes }} minutes</dd></div>
                <div><dt>Startup backups</dt><dd>{{ overview.config.backupsOnStart ? 'Enabled' : 'Disabled' }}</dd></div>
                <div><dt>Deep telemetry</dt><dd>{{ telemetryStatusLabel }}</dd></div>
              </dl>
            </article>
            <article v-if="isAdmin" class="panel">
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
          <ZomboidMap :players="overview.players" :server-version="overview.server.serverVersion" audience="admin" />
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
                      <section class="player-detail-section ability-section">
                        <div class="player-detail-heading"><div><h3>Live abilities</h3><p>States come from the server companion, not this browser.</p></div><small>{{ playerItem.telemetry?.abilities ? `Observed ${relativeTime(playerItem.telemetry.updatedAt)}` : 'State unavailable' }}</small></div>
                        <div v-if="playerItem.telemetry?.abilities" class="ability-state-list">
                          <span :class="{ active: abilityEnabled(playerItem, 'godMode') }">God mode <b>{{ abilityEnabled(playerItem, 'godMode') ? 'ON' : 'OFF' }}</b></span>
                          <span :class="{ active: abilityEnabled(playerItem, 'invisible') }">Invisible <b>{{ abilityEnabled(playerItem, 'invisible') ? 'ON' : 'OFF' }}</b></span>
                          <span :class="{ active: abilityEnabled(playerItem, 'noClip') }">No clip <b>{{ abilityEnabled(playerItem, 'noClip') ? 'ON' : 'OFF' }}</b></span>
                          <span v-if="playerItem.telemetry.abilities.ghostMode !== undefined" :class="{ active: playerItem.telemetry.abilities.ghostMode }">Ghost mode <b>{{ playerItem.telemetry.abilities.ghostMode ? 'ON' : 'OFF' }}</b></span>
                        </div>
                        <p v-else class="ability-state-unavailable">Update the telemetry companion to read authoritative ability state.</p>
                        <div class="ability-grid">
                          <button v-for="ability in abilityOptions" :key="ability.key" :class="{ active: abilityEnabled(playerItem, ability.key) }" :aria-pressed="abilityEnabled(playerItem, ability.key)" :disabled="busy.startsWith('player-') || !playerItem.online || !playerItem.telemetry?.abilities" @click="toggleAbility(playerItem, ability.key)">{{ abilityEnabled(playerItem, ability.key) ? `Disable ${ability.label}` : `Enable ${ability.label}` }}</button>
                          <button :disabled="busy.startsWith('player-') || !playerItem.online" @click="playerAction(playerItem.username, 'lightning')">Lightning</button>
                          <button :disabled="busy.startsWith('player-') || !playerItem.online" @click="playerAction(playerItem.username, 'horde', { count: hordeCount })">Horde × {{ hordeCount }}</button>
                        </div>
                      </section>
                      <section class="player-detail-section role-management-section">
                        <div class="player-detail-heading"><div><h3>In-game role</h3><p>Separate from dashboard authorization. Use Player unless temporary in-game tools are actually needed.</p></div><span class="source-badge">{{ playerItem.accessLevel || 'player' }}</span></div>
                        <div class="field-combo">
                          <select :value="playerRoleDrafts[playerItem.username] ?? playerInGameRole(playerItem)" :aria-label="`In-game role for ${playerItem.username}`" @change="setPlayerRoleDraft(playerItem.username, $event)">
                            <option v-for="roleOption in inGameRoleOptions" :key="roleOption" :value="roleOption">{{ roleOption === 'none' ? 'Player (no elevated role)' : roleOption }}</option>
                          </select>
                          <button class="button outline" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'access-level', { level: playerRoleDrafts[playerItem.username] ?? playerInGameRole(playerItem) })">Apply in-game role</button>
                        </div>
                        <div class="secondary-admin-actions"><button class="button outline compact" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'voiceban', { enabled: true })">Block voice</button><button class="button outline compact" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'voiceban', { enabled: false })">Restore voice</button><button class="button danger-button compact" :disabled="busy.startsWith('player-')" @click="playerAction(playerItem.username, 'clear-map-symbols')">Clear map symbols</button></div>
                      </section>
                      <section class="player-detail-section teleport-section">
                        <div class="teleport-heading">
                          <div><h3>Teleport</h3><p>Move this online survivor to exact world coordinates or another connected survivor. Fresh telemetry positions use the reliable coordinate command.</p></div>
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
                      <section class="player-detail-section danger-zone">
                        <h3>Moderation</h3>
                        <input v-model="playerReasons[playerItem.username]" :aria-label="`Moderation reason for ${playerItem.username}`" aria-required="true" maxlength="300" placeholder="Reason required and recorded in the audit log" required />
                        <div><button class="button outline" :disabled="busy.startsWith('player-') || !playerReasons[playerItem.username]?.trim()" @click="playerAction(playerItem.username, 'kick', { reason: playerReasons[playerItem.username] })">Kick</button><button class="button danger-button" :disabled="busy.startsWith('player-') || !playerReasons[playerItem.username]?.trim()" @click="playerAction(playerItem.username, 'ban', { reason: playerReasons[playerItem.username] })">Ban survivor</button><button class="button outline" :disabled="busy.startsWith('player-') || !playerReasons[playerItem.username]?.trim()" @click="playerAction(playerItem.username, 'remove-whitelist', { reason: playerReasons[playerItem.username] })">Remove whitelist</button></div>
                      </section>
                      <section v-if="isAdmin" class="player-detail-section dashboard-removal-zone">
                        <h3>Dashboard record</h3>
                        <p>Forget this survivor's local history, telemetry, dashboard role, and theme. This does not change the Project Zomboid account, whitelist, save, or support-request history.</p>
                        <button class="button danger-button" :disabled="playerItem.online || busy === `remove-dashboard-${playerItem.username}`" @click="removeDashboardPlayer(playerItem)">{{ playerItem.online ? 'Offline required' : busy === `remove-dashboard-${playerItem.username}` ? 'Removing…' : 'Remove from dashboard' }}</button>
                        <small>The survivor will reappear automatically after signing in or joining the server again.</small>
                      </section>
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

            <div v-if="requestDialogOpen" class="request-dialog-backdrop" aria-hidden="true" @click="closeRequestDialog"></div>
            <article
              v-if="selectedSupportRequest"
              ref="requestDialog"
              :class="['panel', 'staff-request-detail', { 'request-dialog': requestDialogOpen }]"
              :role="requestDialogOpen ? 'dialog' : undefined"
              :aria-modal="requestDialogOpen ? 'true' : undefined"
              :aria-labelledby="requestDialogOpen ? 'staff-request-dialog-title' : undefined"
              :tabindex="requestDialogOpen ? -1 : undefined"
            >
              <header>
                <div><p class="eyebrow">{{ supportRequestCategoryLabel(selectedSupportRequest.category) }}</p><h2 id="staff-request-dialog-title">{{ selectedSupportRequest.subject }}</h2><p>Submitted by <strong>{{ selectedSupportRequest.createdBy }}</strong> · updated {{ relativeTime(selectedSupportRequest.updatedAt) }}</p></div>
                <b :class="['request-status', selectedSupportRequest.status]">{{ supportRequestStatusLabel(selectedSupportRequest.status) }}</b>
                <button v-if="requestDialogOpen" class="request-dialog-close" type="button" aria-label="Close request dialog" @click="closeRequestDialog">×</button>
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

        <template v-else-if="page === 'configuration'">
          <ConfigurationEditor />
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
              <article class="panel weather-control-panel">
                <div class="panel-heading"><div><p class="eyebrow">Climate manager</p><h2>Live weather</h2><p>Use the same Build 42 weather commands available to in-game administrators.</p></div><span class="source-badge live">RCON</span></div>
                <div class="weather-controls">
                  <label>Rain intensity (1–100)<input v-model="rainIntensity" type="number" min="1" max="100" step="1" /></label>
                  <button class="button outline" :disabled="busy === 'start-rain'" @click="runCommand('start-rain', { intensity: rainIntensity })">Start rain</button>
                  <label>Storm duration (in-game hours)<input v-model="stormDuration" type="number" min="1" max="168" step="1" /></label>
                  <button class="button outline" :disabled="busy === 'start-storm'" @click="runCommand('start-storm', { duration: stormDuration })">Start storm</button>
                  <button class="button danger-button" :disabled="busy === 'stop-weather'" @click="runCommand('stop-weather')">Stop weather</button>
                </div>
              </article>
            </section>
            <aside class="panel coordinate-panel">
              <p class="eyebrow">Targeted event</p><h2>Choose a survivor</h2><p>Build 42 RCON targets lightning and horde events by online username.</p>
              <label>Username<input v-model="worldTarget" list="online-usernames" placeholder="Exact online username" /></label>
              <datalist id="online-usernames"><option v-for="playerItem in onlinePlayers" :key="playerItem.username" :value="playerItem.username"></option></datalist>
              <label>Horde size<input v-model="hordeCount" inputmode="numeric" /></label>
              <button class="button primary full" :disabled="!worldTarget.trim()" @click="runCommand('lightning', { username: worldTarget })">Trigger lightning</button>
              <button class="button danger-button full" :disabled="!worldTarget.trim()" @click="runCommand('create-horde', { username: worldTarget, count: hordeCount })">Create horde nearby</button>
              <h3 class="coordinate-subheading">Zombie clearing</h3>
              <p>Build 42 requires a center and radius over RCON. A bare <code>removezombies</code> command reports success but removes nothing.</p>
              <button class="button outline full" :disabled="!worldTarget.trim()" @click="useWorldTargetPosition">Use survivor position</button>
              <div class="field-row triple">
                <label>X<input v-model="zombieClearX" inputmode="numeric" placeholder="10632" /></label>
                <label>Y<input v-model="zombieClearY" inputmode="numeric" placeholder="9761" /></label>
                <label>Z<input v-model="zombieClearZ" inputmode="numeric" /></label>
              </div>
              <label>Radius (1–100 tiles)<input v-model="zombieClearRadius" inputmode="numeric" /></label>
              <button
                class="button danger-button full"
                :disabled="!zombieClearX.trim() || !zombieClearY.trim() || !zombieClearZ.trim() || !zombieClearRadius.trim() || busy === 'remove-zombies'"
                @click="runCommand('remove-zombies', { x: zombieClearX, y: zombieClearY, z: zombieClearZ, radius: zombieClearRadius })"
              >{{ busy === 'remove-zombies' ? 'Removing…' : 'Remove zombies' }}</button>
              <small>Reanimated player corpses are preserved. The current live server help requires a username for lightning and horde events.</small>
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

        <template v-else-if="page === 'sandbox'">
          <div class="section-intro">
            <div><p class="eyebrow">Persistent runtime world controls</p><h2>Live SandboxVars</h2><p>Each change is validated by Project Zomboid, applied to the running world, synchronized to connected clients, and saved back to the server's SandboxVars.lua.</p></div>
            <button class="button outline" :disabled="busy.startsWith('sandbox-')" @click="loadSandboxSettings">Refresh SandboxVars</button>
          </div>
          <div class="live-settings-status">
            <span :class="['status-dot', { live: sandboxSettingsConfigured }]" ></span>
            <strong>{{ sandboxSettingsConfigured ? 'Control bridge ready' : 'Control bridge unavailable' }}</strong>
            <small v-if="sandboxSettingsRefreshedAt">Checked {{ relativeTime(sandboxSettingsRefreshedAt) }}</small>
            <b>NO SERVER RESTART</b>
          </div>
          <p v-if="sandboxSettingsWarning" class="settings-warning" role="status">{{ sandboxSettingsWarning }}</p>
          <article class="panel sandbox-search-panel"><label>Find a SandboxVars option<input v-model="sandboxLiveSearch" type="search" placeholder="ZombieLore, loot, vehicles, farming…" /></label><small>{{ sandboxSettings.length }} scalar settings loaded</small></article>
          <div v-if="!sandboxSettingCategories.length" class="empty-state"><strong>No matching SandboxVars options.</strong><span>Refresh after the server configuration bridge has loaded SandboxVars.lua.</span></div>
          <div v-else class="live-settings-groups sandbox-settings-groups">
            <article v-for="group in sandboxSettingCategories" :key="group.category" class="panel live-settings-group">
              <div class="panel-heading"><div><p class="eyebrow">SandboxOptions</p><h2>{{ group.category }}</h2></div><span>{{ group.settings.length }} controls</span></div>
              <div class="live-setting-list">
                <div v-for="setting in group.settings" :key="setting.key" class="live-setting-row sandbox-setting-row">
                  <div class="live-setting-copy"><strong>{{ setting.label }}</strong><code>{{ setting.option }}</code><small>Current: {{ setting.value }}</small></div>
                  <div class="sandbox-value-control">
                    <button v-if="setting.kind === 'boolean'" type="button" :class="['setting-toggle', { active: Boolean(sandboxSettingDrafts[setting.key]) }]" :aria-pressed="Boolean(sandboxSettingDrafts[setting.key])" :disabled="!sandboxSettingsConfigured || busy === `sandbox-${setting.key}`" @click="sandboxSettingDrafts[setting.key] = !Boolean(sandboxSettingDrafts[setting.key])"><span></span>{{ Boolean(sandboxSettingDrafts[setting.key]) ? 'Enabled' : 'Disabled' }}</button>
                    <input v-else v-model="sandboxSettingDrafts[setting.key]" :type="setting.kind === 'number' ? 'number' : 'text'" :aria-label="setting.option" />
                    <button class="button outline compact" :disabled="!sandboxSettingsConfigured || busy === `sandbox-${setting.key}` || (setting.kind !== 'string' && sandboxSettingDrafts[setting.key] === '')" @click="changeSandboxSetting(setting)">{{ busy === `sandbox-${setting.key}` ? 'Applying…' : 'Apply' }}</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
          <article class="panel warning-panel"><div class="warning-icon">!</div><div><strong>World-state boundary</strong><p>The game accepts these changes live, but options that only affect world generation or initial character creation cannot retroactively rebuild existing cells or characters.</p></div></article>
        </template>

        <template v-else-if="page === 'mods'">
          <div class="section-intro"><div><p class="eyebrow">Read-only source of truth</p><h2>Mods & configuration</h2><p>Imported server values are searchable here. Passwords, tokens, and webhooks are always removed before data reaches the browser.</p><p v-if="overview.integrations.configLastError" class="form-error" role="alert">Configuration sync: {{ overview.integrations.configLastError }}</p></div><span :class="['source-badge', { live: overview.integrations.configFile }]">{{ overview.integrations.configSource === 'ftp' ? 'FTP CONFIG' : overview.integrations.configSource === 'local' ? 'LOCAL CONFIG' : 'NO CONFIG FILE' }}</span></div>
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
              <div v-for="line in consoleLines" :key="line.id" :class="['console-entry', { error: line.error }]">
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

        <template v-else-if="page === 'audit' && isAdmin">
          <div class="section-intro"><div><p class="eyebrow">Local administrator history</p><h2>Audit log</h2><p>Actions are recorded locally with timestamps, targets, outcomes, and redacted command text.</p></div><button class="button outline" @click="loadAll()">Refresh log</button></div>
          <article class="panel table-panel">
            <div v-if="!audit.length" class="empty-state">No actions recorded yet.</div>
            <div v-else class="data-table-wrap"><table class="data-table audit-table"><thead><tr><th>Time</th><th>Result</th><th>Category</th><th>Action</th><th>Target / command / detail</th></tr></thead><tbody><tr v-for="entry in audit" :key="entry.id"><td>{{ new Date(entry.at).toLocaleString() }}</td><td><span :class="['result-chip', { failed: !entry.success }]">{{ entry.success ? 'SUCCESS' : 'FAILED' }}</span></td><td>{{ entry.category }}</td><td><strong>{{ entry.action }}</strong></td><td><code>{{ [entry.target, entry.command, entry.detail].filter(Boolean).join(' · ') || '—' }}</code></td></tr></tbody></table></div>
          </article>
        </template>
      </section>
    </div>

    <transition name="toast"><div v-if="toast" :class="['toast', { error: toast.error }]" role="status"><span>{{ toast.error ? '!' : '✓' }}</span>{{ toast.message }}</div></transition>
  </div>
</template>
