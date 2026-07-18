<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PlayerPortalLanding, PlayerPortalOverview, PlayerPortalSession, PlayerSettings, PlayerTheme, SupportRequest, SupportRequestCategory } from '@shared/types'
import { activeSupportRequestStatuses, supportRequestCategories } from '@shared/support-requests'
import ZomboidMap from './ZomboidMap.vue'

const loading = ref(true)
const available = ref(false)
const authenticated = ref(false)
const username = ref('')
const password = ref('')
const errorMessage = ref('')
const busy = ref(false)
const showPassword = ref(false)
const capsLockOn = ref(false)
const copyMessage = ref('')
const landing = ref<PlayerPortalLanding | null>(null)
const portal = ref<PlayerPortalOverview | null>(null)
const sessionRole = ref<'user' | 'moderator' | 'admin'>('user')
const canAccessAdmin = ref(false)
const playerView = ref<'record' | 'requests' | 'settings'>('record')
const playerSettings = ref<PlayerSettings>({ theme: 'green' })
const supportRequests = ref<SupportRequest[]>([])
const requestForm = ref<{ category: SupportRequestCategory; subject: string; detail: string; targetUsername: string }>({
  category: 'help',
  subject: '',
  detail: '',
  targetUsername: '',
})
const requestBusy = ref('')
const expandedRequestId = ref<string | null>(null)
const requestReply = ref('')
const requestNotice = ref<{ text: string; error?: boolean } | null>(null)
const settingsBusy = ref(false)
const settingsMessage = ref<{ text: string; error?: boolean } | null>(null)
const usernameInput = ref<HTMLInputElement | null>(null)
let refreshTimer: number | undefined
let copyTimer: number | undefined
let settingsMessageTimer: number | undefined
let requestNoticeTimer: number | undefined

const themeChoices: Array<{ id: PlayerTheme; label: string; description: string; accent: string; bright: string; background: string }> = [
  { id: 'green', label: 'Green', description: 'The original survivor-network palette.', accent: '#a7b46a', bright: '#c7d58a', background: '#171a16' },
  { id: 'amber', label: 'Amber', description: 'Warm field notes and warning-light gold.', accent: '#c79b56', bright: '#e6bd75', background: '#201910' },
  { id: 'blue', label: 'Blue', description: 'Cool steel with a clear nighttime glow.', accent: '#6f9fbd', bright: '#91c4df', background: '#111b22' },
  { id: 'violet', label: 'Violet', description: 'A muted purple for a darker broadcast feel.', accent: '#9b83bd', bright: '#bea5df', background: '#1b1622' },
  { id: 'rose', label: 'Rose', description: 'Dusty red accents without losing readability.', accent: '#bd737d', bright: '#df98a2', background: '#211619' },
]

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

async function loadPortal(silent = false) {
  try {
    const previousStatuses = new Map(supportRequests.value.map((request) => [request.id, request.status]))
    const [nextPortal, nextRequests] = await Promise.all([
      api<PlayerPortalOverview>('/api/player/me'),
      api<SupportRequest[]>('/api/player/requests'),
    ])
    portal.value = nextPortal
    supportRequests.value = nextRequests
    playerSettings.value = portal.value.settings
    landing.value = { server: portal.value.server, community: portal.value.community }
    if (silent) {
      const changed = nextRequests.find((request) => previousStatuses.has(request.id) && previousStatuses.get(request.id) !== request.status)
      if (changed) showRequestNotice(`${changed.subject} is now ${requestStatusLabel(changed.status)}`)
    }
  } catch (error) {
    if (!silent) errorMessage.value = error instanceof Error ? error.message : 'Unable to load survivor data'
  }
}

async function loadSession() {
  try {
    const session = await api<PlayerPortalSession>('/api/player/session')
    available.value = session.available
    authenticated.value = session.authenticated
    landing.value = session.landing
    if (session.username) username.value = session.username
    sessionRole.value = session.role ?? 'user'
    canAccessAdmin.value = session.canAccessAdmin
    if (session.authenticated) await loadPortal()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to reach the player portal'
  } finally {
    loading.value = false
  }
}

async function login() {
  errorMessage.value = ''
  busy.value = true
  try {
    const result = await api<{ username: string; role: 'user' | 'moderator' | 'admin'; canAccessAdmin: boolean }>('/api/player/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    username.value = result.username
    sessionRole.value = result.role
    canAccessAdmin.value = result.canAccessAdmin
    password.value = ''
    authenticated.value = true
    await loadPortal()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to sign in'
    await nextTick()
    usernameInput.value?.focus()
  } finally {
    busy.value = false
  }
}

async function logout() {
  await api('/api/player/logout', { method: 'POST', body: '{}' })
  authenticated.value = false
  portal.value = null
  supportRequests.value = []
  sessionRole.value = 'user'
  canAccessAdmin.value = false
  playerView.value = 'record'
  playerSettings.value = { theme: 'green' }
  password.value = ''
  showPassword.value = false
  expandedRequestId.value = null
  requestReply.value = ''
  await nextTick()
  usernameInput.value?.focus()
}

function showRequestNotice(text: string, error = false) {
  requestNotice.value = { text, error }
  window.clearTimeout(requestNoticeTimer)
  requestNoticeTimer = window.setTimeout(() => { requestNotice.value = null }, 4_500)
}

function requestCategoryLabel(category: SupportRequestCategory): string {
  return supportRequestCategories.find((definition) => definition.id === category)?.label ?? category
}

function requestStatusLabel(status: SupportRequest['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function requestLocationLabel(request: SupportRequest): string {
  const location = request.location
  return location ? `${location.x.toFixed(0)}, ${location.y.toFixed(0)}, z${location.z.toFixed(0)} · observed ${relativeTime(location.observedAt)}` : 'No telemetry location was available'
}

async function createSupportRequest() {
  requestBusy.value = 'create'
  try {
    const created = await api<SupportRequest>('/api/player/requests', {
      method: 'POST',
      body: JSON.stringify(requestForm.value),
    })
    supportRequests.value = [created, ...supportRequests.value]
    expandedRequestId.value = created.id
    requestForm.value = { category: 'help', subject: '', detail: '', targetUsername: '' }
    showRequestNotice('Request sent to the staff queue')
  } catch (error) {
    showRequestNotice(error instanceof Error ? error.message : 'Request could not be created', true)
  } finally {
    requestBusy.value = ''
  }
}

async function addPlayerRequestMessage(request: SupportRequest) {
  if (!requestReply.value.trim()) return
  requestBusy.value = `message-${request.id}`
  try {
    const updated = await api<SupportRequest>(`/api/player/requests/${encodeURIComponent(request.id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: requestReply.value }),
    })
    supportRequests.value = supportRequests.value.map((item) => item.id === updated.id ? updated : item)
    requestReply.value = ''
    showRequestNotice('Reply added')
  } catch (error) {
    showRequestNotice(error instanceof Error ? error.message : 'Reply could not be added', true)
  } finally {
    requestBusy.value = ''
  }
}

function showSettingsMessage(text: string, error = false) {
  settingsMessage.value = { text, error }
  window.clearTimeout(settingsMessageTimer)
  settingsMessageTimer = window.setTimeout(() => { settingsMessage.value = null }, 4_000)
}

async function chooseTheme(theme: PlayerTheme) {
  if (settingsBusy.value || playerSettings.value.theme === theme) return
  const previous = playerSettings.value
  playerSettings.value = { ...previous, theme }
  settingsBusy.value = true
  try {
    playerSettings.value = await api<PlayerSettings>('/api/player/settings', {
      method: 'PATCH',
      body: JSON.stringify({ theme }),
    })
    if (portal.value) portal.value.settings = playerSettings.value
    showSettingsMessage(`${themeChoices.find((choice) => choice.id === theme)?.label ?? 'Theme'} theme saved`)
  } catch (error) {
    playerSettings.value = previous
    showSettingsMessage(error instanceof Error ? error.message : 'Theme could not be saved', true)
  } finally {
    settingsBusy.value = false
  }
}

function clearLoginError() {
  errorMessage.value = ''
}

function trackCapsLock(event: KeyboardEvent) {
  capsLockOn.value = event.getModifierState('CapsLock')
}

async function copyJoinAddress() {
  const address = landing.value?.community.joinAddress
  if (!address) return
  window.clearTimeout(copyTimer)
  try {
    await navigator.clipboard.writeText(address)
    copyMessage.value = 'Server address copied'
  } catch {
    copyMessage.value = 'Copy unavailable — select the address manually'
  }
  copyTimer = window.setTimeout(() => { copyMessage.value = '' }, 4_000)
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

const developedPerks = computed(() => Object.entries(portal.value?.player?.telemetry?.perks ?? {})
  .filter(([, level]) => level > 0)
  .sort(([leftName, leftLevel], [rightName, rightLevel]) => rightLevel - leftLevel || leftName.localeCompare(rightName)))

const currentServer = computed(() => portal.value?.server ?? landing.value?.server)
const activeRequestCount = computed(() => supportRequests.value.filter((request) => activeSupportRequestStatuses.includes(request.status)).length)
const selectedRequestCategory = computed(() => supportRequestCategories.find((category) => category.id === requestForm.value.category)!)
const currentCommunity = computed(() => portal.value?.community ?? landing.value?.community)
const brandName = computed(() => currentCommunity.value?.name ?? 'Project Zomboid')
const brandInitials = computed(() => currentCommunity.value?.initials ?? 'PZ')
const brandTagline = computed(() => currentCommunity.value?.tagline ?? 'Survivor network')
watch(brandName, (name) => { document.title = `${name} // Survivor Network` }, { immediate: true })
const mapLabel = computed(() => {
  const maps = currentServer.value?.map.split(';') ?? []
  return maps[maps.length - 1] || currentServer.value?.map || 'Unknown'
})
const communityLinks = computed(() => [
  { label: 'Group chat / help', url: currentCommunity.value?.discordUrl },
  { label: 'Server rules', url: currentCommunity.value?.rulesUrl },
  { label: 'Required mods', url: currentCommunity.value?.modsUrl },
].filter((link): link is { label: string; url: string } => Boolean(link.url)))
const serverStatusLabel = computed(() => {
  if (!currentServer.value?.lastPollAt && !currentServer.value?.connected) return 'Checking server'
  return currentServer.value.connected ? 'Server online' : 'Server unavailable'
})
const serverStatusDetail = computed(() => currentServer.value?.lastPollAt
  ? `Checked ${relativeTime(currentServer.value.lastPollAt)}`
  : 'Waiting for the first status check')
const mapPlayers = computed(() => portal.value?.mapPlayers ?? [])
const dashboardRoleLabel = computed(() => {
  const role = portal.value?.role ?? sessionRole.value
  return role === 'admin' ? 'Administrator' : role === 'moderator' ? 'Moderator' : 'User'
})
const positionLabel = computed(() => {
  const position = portal.value?.player?.telemetry?.position
  return position ? `${position.x.toFixed(0)}, ${position.y.toFixed(0)} · floor ${position.z.toFixed(0)}` : 'Not reported'
})
const healthLabel = computed(() => {
  const health = portal.value?.player?.telemetry?.health
  return health === undefined ? 'Not reported' : `${health.toFixed(1)}%`
})
const conditionState = computed(() => {
  const player = portal.value?.player
  if (!player) return { tone: 'neutral', title: 'Waiting for your first visit', message: 'Join with this username and your record will appear after the dashboard sees you.' }
  const telemetry = player.telemetry
  if (!telemetry) return { tone: 'warning', title: 'Character details pending', message: 'Your activity is recorded, but detailed health and location telemetry has not arrived yet.' }
  if (telemetry.health !== undefined && telemetry.health <= 35) {
    return { tone: 'danger', title: 'Low health in the latest snapshot', message: `Health was ${telemetry.health.toFixed(1)}%. Check your condition carefully when you return.` }
  }
  const ageSeconds = Math.max(0, (Date.now() - Date.parse(telemetry.updatedAt)) / 1000)
  if (ageSeconds > 300) return { tone: 'warning', title: 'Snapshot may be stale', message: `The last detailed update was ${relativeTime(telemetry.updatedAt)}. Your current condition may have changed.` }
  return { tone: 'good', title: player.online ? 'You are online now' : 'Latest snapshot is ready', message: `Character telemetry updated ${relativeTime(telemetry.updatedAt)}.` }
})

onMounted(async () => {
  await loadSession()
  refreshTimer = window.setInterval(() => {
    if (authenticated.value) void loadPortal(true)
    else void loadSession()
  }, 15_000)
})

onBeforeUnmount(() => {
  window.clearInterval(refreshTimer)
  window.clearTimeout(copyTimer)
  window.clearTimeout(settingsMessageTimer)
  window.clearTimeout(requestNoticeTimer)
})
</script>

<template>
  <div v-if="loading" class="splash">
    <div class="splash-mark">PZ</div>
    <p>Checking in with the server...</p>
  </div>

  <main v-else-if="!authenticated" class="player-login-shell">
    <section class="player-login-card">
      <div class="brand-lockup player-login-brand">
        <span class="brand-mark">{{ brandInitials }}</span>
        <div><strong>{{ brandName }}</strong><small>{{ brandTagline }}</small></div>
      </div>

      <div class="player-login-copy">
        <p class="eyebrow">Private survivor access</p>
        <h1>{{ currentCommunity?.portalTitle ?? 'Your life. Your record.' }}</h1>
        <p>{{ currentCommunity?.portalDescription ?? 'Check the server, jump back in, or open your private character record.' }}</p>
      </div>

      <form class="player-login-form" :aria-busy="busy" @submit.prevent="login">
        <div>
          <label for="player-username">Project Zomboid username</label>
          <input
            id="player-username"
            ref="usernameInput"
            v-model="username"
            autocomplete="username"
            maxlength="64"
            placeholder="Your username"
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'player-login-error' : undefined"
            autofocus
            @input="clearLoginError"
          />
        </div>
        <div>
          <label for="player-password">Project Zomboid account password</label>
          <div class="password-field">
            <input
              id="player-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              maxlength="256"
              :aria-invalid="errorMessage ? 'true' : undefined"
              :aria-describedby="errorMessage ? 'player-password-help player-login-error' : 'player-password-help'"
              @input="clearLoginError"
              @keydown="trackCapsLock"
              @keyup="trackCapsLock"
            />
            <button type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword" @click="showPassword = !showPassword">
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <span id="player-password-help" class="field-help">Use the account password paired with your username, not the shared server password.</span>
          <span v-if="capsLockOn" class="field-warning">Caps Lock is on.</span>
        </div>
        <p v-if="errorMessage" id="player-login-error" class="form-error" role="alert">{{ errorMessage }}</p>
        <p v-else-if="!available" class="form-error" role="status">Player sign-in is not configured on this dashboard.</p>
        <button class="button primary" type="submit" :disabled="busy || !available || !username.trim() || !password">
          {{ busy ? 'Verifying survivor...' : 'Open survivor record' }} <span>→</span>
        </button>
      </form>

      <section v-if="currentServer" class="player-friend-hub" aria-label="Server information">
        <div class="player-server-health">
          <span :class="['status-dot', { live: currentServer.connected }]"></span>
          <div><strong>{{ serverStatusLabel }}</strong><small>{{ serverStatusDetail }}</small></div>
        </div>
        <div><small>Survivors online</small><strong>{{ currentServer.onlinePlayers }} / {{ currentServer.maxPlayers }}</strong></div>
        <div class="player-hub-map"><small>Map</small><strong>{{ mapLabel }}</strong></div>
        <button v-if="currentCommunity?.joinAddress" class="player-copy-address" type="button" @click="copyJoinAddress">
          <span><small>Join address</small><strong>{{ currentCommunity.joinAddress }}</strong></span><b>Copy</b>
        </button>
      </section>

      <p v-if="copyMessage" class="player-copy-message" role="status">{{ copyMessage }}</p>
      <p v-if="currentCommunity?.announcement" class="player-announcement"><strong>Community note</strong>{{ currentCommunity.announcement }}</p>

      <div class="player-login-guidance">
        <details>
          <summary>Need help signing in?</summary>
          <span>This uses the password paired with your Project Zomboid username, not the shared server password. If it still fails, ask the group admin to check your account.</span>
        </details>
        <span v-if="currentCommunity?.restartSchedule"><strong>Restart schedule:</strong> {{ currentCommunity.restartSchedule }}</span>
      </div>
      <nav class="player-login-links" aria-label="Community links">
        <a v-for="link in communityLinks" :key="link.label" :href="link.url" target="_blank" rel="noreferrer">{{ link.label }} ↗</a>
        <a href="https://github.com/DoomedGaming/pz-rcon-admin" target="_blank" rel="noreferrer">Source &amp; license ↗</a>
      </nav>
    </section>
  </main>

  <div v-else-if="portal" class="player-portal-shell" :data-player-theme="playerSettings.theme">
    <header class="player-portal-topbar">
      <div class="brand-lockup">
        <span class="brand-mark">{{ brandInitials }}</span>
        <div><strong>{{ brandName }}</strong><small>{{ brandTagline }}</small></div>
      </div>
      <div class="player-portal-actions">
        <a v-if="portal.canAccessAdmin" class="button outline compact" href="/admin">{{ dashboardRoleLabel }} console</a>
        <span :class="['status-chip', { online: portal.player?.online }]"><span></span>{{ portal.player?.online ? 'Online now' : 'Offline' }}</span>
        <button class="text-button" type="button" @click="logout">Sign out</button>
      </div>
    </header>

    <nav class="player-portal-tabs" aria-label="Survivor pages">
      <button type="button" :class="{ active: playerView === 'record' }" @click="playerView = 'record'">Survivor record</button>
      <button type="button" :class="{ active: playerView === 'requests' }" @click="playerView = 'requests'">Request center <span v-if="activeRequestCount">{{ activeRequestCount }}</span></button>
      <button type="button" :class="{ active: playerView === 'settings' }" @click="playerView = 'settings'">Settings</button>
    </nav>

    <main v-if="playerView === 'record'" class="player-portal-content">
      <section class="player-portal-hero">
        <div>
          <p class="eyebrow">Private survivor record</p>
          <h1>Welcome back, <span>{{ portal.username }}</span>.</h1>
          <p v-if="portal.player">Here is what the server last saw, with the most useful details first.</p>
          <p v-else>Your account works, but the dashboard has not observed this character yet.</p>
        </div>
        <div class="player-portal-avatar">{{ portal.username.slice(0, 2).toUpperCase() }}</div>
      </section>

      <section class="player-server-strip" aria-label="Current server status">
        <div><small>Server</small><strong>{{ portal.server.name }}</strong></div>
        <div><small>Population</small><strong>{{ portal.server.onlinePlayers }} / {{ portal.server.maxPlayers }}</strong></div>
        <div><small>Map</small><strong>{{ mapLabel }}</strong></div>
        <div><small>Connection</small><strong>{{ portal.server.connected ? 'Online' : 'Unavailable' }}</strong></div>
        <div><small>Next restart</small><strong>{{ portal.community.restartSchedule || 'Not published' }}</strong></div>
      </section>

      <section v-if="!portal.player" class="player-portal-empty">
        <span>?</span>
        <div><h2>No character snapshot yet</h2><p>Join the server with {{ portal.username }}. Your record will appear after the dashboard sees you online.</p></div>
      </section>

      <template v-else>
        <section :class="['player-condition-banner', conditionState.tone]" aria-live="polite">
          <span aria-hidden="true">{{ conditionState.tone === 'danger' ? '!' : conditionState.tone === 'warning' ? '△' : '✓' }}</span>
          <div><strong>{{ conditionState.title }}</strong><p>{{ conditionState.message }}</p></div>
        </section>

        <section class="player-portal-metrics player-priority-metrics" aria-label="Current survivor status">
          <article><small>Status</small><strong>{{ portal.player.online ? 'Online now' : `Seen ${relativeTime(portal.player.lastSeenAt)}` }}</strong></article>
          <article><small>Latest health</small><strong>{{ healthLabel }}</strong></article>
          <article><small>Last known location</small><strong>{{ positionLabel }}</strong></article>
          <article><small>Character data</small><strong>{{ portal.player.telemetry ? relativeTime(portal.player.telemetry.updatedAt) : 'Pending' }}</strong></article>
        </section>

        <ZomboidMap :players="mapPlayers" audience="player" :follow-username="portal.player?.username" />

        <section class="player-portal-metrics player-activity-metrics" aria-label="Survivor activity summary">
          <article><small>Sessions observed</small><strong>{{ portal.player.sessionCount }}</strong></article>
          <article><small>Observed playtime</small><strong>{{ formatDuration(portal.player.totalOnlineSeconds) }}</strong></article>
          <article><small>Zombie kills</small><strong>{{ portal.player.telemetry?.zombieKills ?? '—' }}</strong></article>
        </section>

        <section class="player-portal-grid">
          <article class="player-portal-card character-card">
            <div class="player-card-heading">
              <div><p class="eyebrow">Latest server snapshot</p><h2>Character condition</h2></div>
              <small>{{ portal.player.telemetry ? relativeTime(portal.player.telemetry.updatedAt) : 'Awaiting telemetry' }}</small>
            </div>

            <p v-if="!portal.player.telemetry" class="player-card-empty">Detailed character telemetry will appear after you connect while the server exporter is active.</p>
            <template v-else>
              <dl class="player-character-stats">
                <div><dt>Health</dt><dd>{{ healthLabel }}</dd></div>
                <div><dt>Hours survived</dt><dd>{{ portal.player.telemetry.hoursSurvived !== undefined ? portal.player.telemetry.hoursSurvived.toFixed(1) : '—' }}</dd></div>
                <div><dt>Profession</dt><dd>{{ portal.player.telemetry.profession || '—' }}</dd></div>
                <div><dt>Carried weight</dt><dd>{{ portal.player.telemetry.inventoryWeight !== undefined ? portal.player.telemetry.inventoryWeight.toFixed(2) : '—' }}</dd></div>
                <div class="position-stat"><dt>Last known position</dt><dd>{{ positionLabel }}</dd></div>
              </dl>
            </template>
          </article>

          <article class="player-portal-card identity-card">
            <details class="player-card-details" open>
              <summary><span><small>Identity</small>Survivor profile</span><b>⌄</b></summary>
              <dl class="player-identity-list">
                <div><dt>Username</dt><dd>{{ portal.player.username }}</dd></div>
                <div><dt>Access level</dt><dd>{{ portal.player.accessLevel || 'Player' }}</dd></div>
                <div><dt>Dashboard role</dt><dd>{{ dashboardRoleLabel }}</dd></div>
                <div><dt>First observed</dt><dd>{{ relativeTime(portal.player.firstSeenAt) }}</dd></div>
                <div><dt>Last observed</dt><dd>{{ relativeTime(portal.player.lastSeenAt) }}</dd></div>
              </dl>
            </details>
          </article>

          <article class="player-portal-card traits-card">
            <details class="player-card-details" open>
              <summary><span><small>Build</small>Traits</span><b>⌄</b></summary>
              <div v-if="portal.player.telemetry?.traits?.length" class="player-trait-list">
                <span v-for="trait in portal.player.telemetry.traits" :key="trait">{{ trait }}</span>
              </div>
              <p v-else class="player-card-empty">No traits have been reported yet.</p>
            </details>
          </article>

          <article class="player-portal-card skills-card">
            <details class="player-card-details" open>
              <summary><span><small>Progress</small>Developed skills</span><b>⌄</b></summary>
              <div v-if="developedPerks.length" class="player-skill-list">
                <div v-for="([name, level]) in developedPerks" :key="name"><span>{{ name }}</span><strong>{{ level }}</strong></div>
              </div>
              <p v-else class="player-card-empty">No developed skills have been reported yet.</p>
            </details>
          </article>
        </section>
      </template>

      <footer class="player-portal-footnote">
        <span :class="['status-dot', { live: portal.telemetry.connected }]"></span>
        <span>Character data is read-only. Last telemetry sync {{ relativeTime(portal.telemetry.lastSyncAt) }}.</span>
        <a href="https://github.com/DoomedGaming/pz-rcon-admin" target="_blank" rel="noreferrer">Source &amp; license ↗</a>
      </footer>
    </main>

    <main v-else-if="playerView === 'requests'" class="player-request-content">
      <section class="player-request-hero">
        <div><p class="eyebrow">Private staff channel</p><h1>Request center</h1><p>Ask for help without giving your account access to administrator commands. Staff replies and status changes appear here automatically.</p></div>
        <span>{{ activeRequestCount }} active</span>
      </section>

      <div class="player-request-layout">
        <form class="player-request-create" @submit.prevent="createSupportRequest">
          <div class="player-request-heading"><div><p class="eyebrow">New request</p><h2>How can staff help?</h2></div><small>Maximum 5 active</small></div>

          <div class="request-category-grid" role="radiogroup" aria-label="Request category">
            <button
              v-for="category in supportRequestCategories"
              :key="category.id"
              type="button"
              role="radio"
              :aria-checked="requestForm.category === category.id"
              :class="{ active: requestForm.category === category.id }"
              @click="requestForm.category = category.id"
            ><strong>{{ category.label }}</strong><small>{{ category.description }}</small></button>
          </div>

          <label>Subject<input v-model="requestForm.subject" maxlength="100" required placeholder="Short summary" /></label>
          <label v-if="selectedRequestCategory.targetLabel">{{ selectedRequestCategory.targetLabel }}<input v-model="requestForm.targetUsername" maxlength="64" :required="selectedRequestCategory.targetRequired" placeholder="Exact username if known" /></label>
          <label>Request details<textarea v-model="requestForm.detail" rows="6" maxlength="2000" required placeholder="Explain what happened and what you need from staff."></textarea></label>

          <div v-if="requestForm.category === 'unstuck'" class="request-location-preview">
            <span>⌖</span>
            <div><strong>Latest location will be attached</strong><small>{{ portal.player?.telemetry?.position ? positionLabel : 'No telemetry is available; you can still submit the request.' }}</small></div>
          </div>

          <button class="button primary full" type="submit" :disabled="requestBusy === 'create' || requestForm.subject.trim().length < 3 || requestForm.detail.trim().length < 10">
            {{ requestBusy === 'create' ? 'Sending…' : 'Send request to staff' }}
          </button>
        </form>

        <section class="player-request-history" aria-labelledby="request-history-title">
          <div class="player-request-heading"><div><p class="eyebrow">Your history</p><h2 id="request-history-title">Requests & replies</h2></div><small>Updates every 15 seconds</small></div>
          <div v-if="!supportRequests.length" class="request-empty"><span>✓</span><div><strong>No requests yet</strong><p>Your private conversation with moderators and administrators will appear here.</p></div></div>
          <article v-for="request in supportRequests" v-else :key="request.id" :class="['player-request-card', { expanded: expandedRequestId === request.id }]">
            <button type="button" class="player-request-summary" :aria-expanded="expandedRequestId === request.id" @click="expandedRequestId = expandedRequestId === request.id ? null : request.id">
              <span class="request-category-mark">{{ requestCategoryLabel(request.category).slice(0, 1) }}</span>
              <span><small>{{ requestCategoryLabel(request.category) }} · {{ relativeTime(request.updatedAt) }}</small><strong>{{ request.subject }}</strong></span>
              <b :class="['request-status', request.status]">{{ requestStatusLabel(request.status) }}</b>
            </button>
            <div v-if="expandedRequestId === request.id" class="player-request-detail">
              <p>{{ request.detail }}</p>
              <dl>
                <div v-if="request.targetUsername"><dt>Related survivor</dt><dd>{{ request.targetUsername }}</dd></div>
                <div v-if="request.location"><dt>Attached location</dt><dd>{{ requestLocationLabel(request) }}</dd></div>
                <div><dt>Assigned staff</dt><dd>{{ request.claimedBy || 'Waiting to be claimed' }}</dd></div>
                <div><dt>Created</dt><dd>{{ new Date(request.createdAt).toLocaleString() }}</dd></div>
              </dl>
              <div class="request-conversation">
                <div v-if="!request.messages.length" class="request-conversation-empty">No replies yet. Staff can see this request in their live queue.</div>
                <article v-for="message in request.messages" :key="message.id" :class="{ staff: message.authorRole !== 'user' }">
                  <div><strong>{{ message.author }}</strong><span>{{ message.authorRole }} · {{ relativeTime(message.at) }}</span></div><p>{{ message.body }}</p>
                </article>
              </div>
              <form class="request-reply-form" @submit.prevent="addPlayerRequestMessage(request)">
                <label :for="`request-reply-${request.id}`">Add a reply<textarea :id="`request-reply-${request.id}`" v-model="requestReply" rows="3" maxlength="1000" placeholder="Add information for staff"></textarea></label>
                <button class="button outline" :disabled="requestBusy === `message-${request.id}` || !requestReply.trim()">{{ requestBusy === `message-${request.id}` ? 'Sending…' : 'Reply' }}</button>
              </form>
            </div>
          </article>
        </section>
      </div>

      <p v-if="requestNotice" :class="['player-request-notice', { error: requestNotice.error }]" role="status">{{ requestNotice.text }}</p>
    </main>

    <main v-else class="player-settings-content">
      <section class="player-settings-hero">
        <div><p class="eyebrow">Personal preferences</p><h1>User settings</h1><p>Make this dashboard feel like yours. These preferences follow your Project Zomboid account.</p></div>
        <span>Saved for {{ portal.username }}</span>
      </section>

      <section class="player-settings-panel" aria-labelledby="theme-settings-title">
        <div class="player-settings-heading">
          <div><p class="eyebrow">Appearance</p><h2 id="theme-settings-title">Full theme</h2><p>Choose the complete palette used for backgrounds, panels, navigation, text, borders, and highlights throughout your survivor record and any dashboard pages your role can access.</p></div>
          <span class="player-settings-current">{{ themeChoices.find((choice) => choice.id === playerSettings.theme)?.label }} selected</span>
        </div>
        <div class="theme-choice-grid" role="radiogroup" aria-label="Full theme">
          <button
            v-for="choice in themeChoices"
            :key="choice.id"
            type="button"
            role="radio"
            :aria-checked="playerSettings.theme === choice.id"
            :class="['theme-choice', { active: playerSettings.theme === choice.id }]"
            :disabled="settingsBusy"
            @click="chooseTheme(choice.id)"
          >
            <span class="theme-swatch" :style="{ '--theme-swatch': choice.accent, '--theme-swatch-bright': choice.bright, '--theme-swatch-bg': choice.background }"></span>
            <span><strong>{{ choice.label }}</strong><small>{{ choice.description }}</small></span>
            <b>{{ playerSettings.theme === choice.id ? 'Selected' : 'Choose' }}</b>
          </button>
        </div>
        <p v-if="settingsMessage" :class="['player-settings-message', { error: settingsMessage.error }]" role="status">{{ settingsMessage.text }}</p>
      </section>
    </main>
  </div>
</template>
