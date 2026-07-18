import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_PLAYER_SETTINGS, isPlayerTheme } from '../shared/player-settings.js'
import { activeSupportRequestStatuses } from '../shared/support-requests.js'
import type { ActivityPoint, AuditEntry, DashboardRole, DashboardUser, LiveSettingOverride, PlayerRecord, PlayerSettings, PlayerTelemetry, PlayerTheme, SupportRequest, SupportRequestCategory, SupportRequestLocation, SupportRequestStatus } from '../shared/types.js'

interface StoreState {
  players: Record<string, PlayerRecord>
  dashboardUsers: Record<string, DashboardUser>
  liveSettingOverrides: Record<string, LiveSettingOverride>
  playerSettings: Record<string, PlayerSettings>
  supportRequests: Record<string, SupportRequest>
  activity: ActivityPoint[]
  audit: AuditEntry[]
  startedAt: string
}

const emptyState = (): StoreState => ({
  players: {},
  dashboardUsers: {},
  liveSettingOverrides: {},
  playerSettings: {},
  supportRequests: {},
  activity: [],
  audit: [],
  startedAt: new Date().toISOString(),
})

export class DashboardStore {
  private state: StoreState

  constructor(private readonly path: string) {
    this.state = this.load()
  }

  private load(): StoreState {
    if (!existsSync(this.path)) return emptyState()
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as StoreState
      return {
        ...emptyState(),
        ...parsed,
        players: parsed.players ?? {},
        dashboardUsers: parsed.dashboardUsers ?? {},
        liveSettingOverrides: parsed.liveSettingOverrides ?? {},
        playerSettings: parsed.playerSettings ?? {},
        supportRequests: parsed.supportRequests ?? {},
      }
    } catch {
      return emptyState()
    }
  }

  private save() {
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    writeFileSync(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 })
    renameSync(temporary, this.path)
  }

  markPlayersOnline(usernames: string[], at = new Date()) {
    const now = at.toISOString()
    const online = new Set(usernames.map((name) => name.trim()).filter(Boolean))

    for (const [username, player] of Object.entries(this.state.players)) {
      if (player.online && !online.has(username)) {
        const started = player.currentSessionStartedAt ? Date.parse(player.currentSessionStartedAt) : at.getTime()
        player.totalOnlineSeconds += Math.max(0, Math.round((at.getTime() - started) / 1000))
        player.currentSessionStartedAt = undefined
        player.online = false
      }
    }

    for (const username of online) {
      const existing = this.state.players[username]
      if (!existing) {
        this.state.players[username] = {
          username,
          online: true,
          firstSeenAt: now,
          lastSeenAt: now,
          currentSessionStartedAt: now,
          totalOnlineSeconds: 0,
          sessionCount: 1,
        }
      } else {
        if (!existing.online) {
          existing.online = true
          existing.currentSessionStartedAt = now
          existing.sessionCount += 1
        }
        existing.lastSeenAt = now
      }
    }

    this.state.activity.push({ at: now, online: online.size })
    this.state.activity = this.state.activity.slice(-672)
    this.save()
  }

  getPlayers(now = new Date()): PlayerRecord[] {
    return Object.values(this.state.players)
      .map((player) => {
        const current = player.online && player.currentSessionStartedAt
          ? Math.max(0, Math.round((now.getTime() - Date.parse(player.currentSessionStartedAt)) / 1000))
          : 0
        return { ...player, totalOnlineSeconds: player.totalOnlineSeconds + current }
      })
      .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt.localeCompare(a.lastSeenAt))
  }

  getPlayer(username: string, now = new Date()): PlayerRecord | undefined {
    const normalized = username.trim().toLocaleLowerCase('en-US')
    if (!normalized) return undefined
    const matches = this.getPlayers(now).filter((player) => player.username.toLocaleLowerCase('en-US') === normalized)
    return matches.length === 1 ? matches[0] : undefined
  }

  recordDashboardLogin(username: string, at = new Date()): DashboardUser {
    const canonical = username.trim()
    const key = canonical.toLocaleLowerCase('en-US')
    const now = at.toISOString()
    const existing = this.state.dashboardUsers[key]
    const user: DashboardUser = existing
      ? { ...existing, username: canonical, lastSeenAt: now, lastLoginAt: now }
      : { username: canonical, role: 'user', firstSeenAt: now, lastSeenAt: now, lastLoginAt: now }
    this.state.dashboardUsers[key] = user
    this.save()
    return { ...user }
  }

  getDashboardRole(username: string): DashboardRole {
    return this.state.dashboardUsers[username.trim().toLocaleLowerCase('en-US')]?.role ?? 'user'
  }

  getDashboardUsers(now = new Date()): DashboardUser[] {
    const users = new Map<string, DashboardUser>()
    for (const player of this.getPlayers(now)) {
      const key = player.username.toLocaleLowerCase('en-US')
      const existing = this.state.dashboardUsers[key]
      users.set(key, existing ? { ...existing, username: player.username, lastSeenAt: player.lastSeenAt } : {
        username: player.username,
        role: 'user',
        firstSeenAt: player.firstSeenAt,
        lastSeenAt: player.lastSeenAt,
      })
    }
    for (const [key, user] of Object.entries(this.state.dashboardUsers)) {
      if (!users.has(key)) users.set(key, { ...user })
    }
    return [...users.values()].sort((left, right) => {
      const rank = { admin: 2, moderator: 1, user: 0 }
      return rank[right.role] - rank[left.role] || left.username.localeCompare(right.username)
    })
  }

  setDashboardRole(username: string, role: DashboardRole, updatedBy: string, at = new Date()): DashboardUser {
    const canonical = username.trim()
    const key = canonical.toLocaleLowerCase('en-US')
    const known = this.state.dashboardUsers[key]
      ?? this.getPlayers(at).find((player) => player.username.toLocaleLowerCase('en-US') === key)
    if (!known) throw new Error('Dashboard user was not found')
    const now = at.toISOString()
    const user: DashboardUser = {
      username: known.username,
      role,
      firstSeenAt: known.firstSeenAt,
      lastSeenAt: known.lastSeenAt,
      lastLoginAt: 'lastLoginAt' in known ? known.lastLoginAt : undefined,
      roleUpdatedAt: now,
      roleUpdatedBy: updatedBy,
    }
    this.state.dashboardUsers[key] = user
    this.save()
    return { ...user }
  }

  getLiveSettingOverrides(): Record<string, LiveSettingOverride> {
    return Object.fromEntries(Object.entries(this.state.liveSettingOverrides).map(([key, value]) => [key, { ...value }]))
  }

  setLiveSettingOverride(key: string, value: boolean | number, updatedBy: string, at = new Date()): LiveSettingOverride {
    const override = { value, updatedAt: at.toISOString(), updatedBy }
    this.state.liveSettingOverrides[key] = override
    this.save()
    return { ...override }
  }

  getPlayerSettings(username: string): PlayerSettings {
    const key = username.trim().toLocaleLowerCase('en-US')
    const saved = this.state.playerSettings[key]
    return {
      theme: isPlayerTheme(saved?.theme) ? saved.theme : DEFAULT_PLAYER_SETTINGS.theme,
      ...(saved?.updatedAt ? { updatedAt: saved.updatedAt } : {}),
    }
  }

  setPlayerTheme(username: string, theme: PlayerTheme, at = new Date()): PlayerSettings {
    const key = username.trim().toLocaleLowerCase('en-US')
    if (!key) throw new Error('Player username is required')
    const settings = { ...this.getPlayerSettings(username), theme, updatedAt: at.toISOString() }
    this.state.playerSettings[key] = settings
    this.save()
    return { ...settings }
  }

  private cloneSupportRequest(request: SupportRequest): SupportRequest {
    return {
      ...request,
      ...(request.location ? { location: { ...request.location } } : {}),
      messages: request.messages.map((message) => ({ ...message })),
    }
  }

  getSupportRequests(): SupportRequest[] {
    return Object.values(this.state.supportRequests)
      .map((request) => this.cloneSupportRequest(request))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  getSupportRequestsForUser(username: string): SupportRequest[] {
    const key = username.trim().toLocaleLowerCase('en-US')
    return this.getSupportRequests().filter((request) => request.createdBy.toLocaleLowerCase('en-US') === key)
  }

  getSupportRequest(id: string): SupportRequest | undefined {
    const request = this.state.supportRequests[id]
    return request ? this.cloneSupportRequest(request) : undefined
  }

  createSupportRequest(input: {
    category: SupportRequestCategory
    createdBy: string
    subject: string
    detail: string
    targetUsername?: string
    location?: SupportRequestLocation
  }, at = new Date()): SupportRequest {
    const active = this.getSupportRequestsForUser(input.createdBy)
      .filter((request) => activeSupportRequestStatuses.includes(request.status))
    if (active.length >= 5) throw new Error('You already have five active requests. Wait for staff to resolve one before creating another.')
    const now = at.toISOString()
    const request: SupportRequest = {
      id: randomUUID(),
      category: input.category,
      status: 'open',
      createdBy: input.createdBy.trim(),
      subject: input.subject,
      detail: input.detail,
      ...(input.targetUsername ? { targetUsername: input.targetUsername } : {}),
      ...(input.location ? { location: { ...input.location } } : {}),
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    this.state.supportRequests[request.id] = request
    this.save()
    return this.cloneSupportRequest(request)
  }

  addSupportRequestMessage(id: string, author: string, authorRole: DashboardRole, body: string, at = new Date()): SupportRequest {
    const request = this.state.supportRequests[id]
    if (!request) throw new Error('Support request was not found')
    const now = at.toISOString()
    request.messages.push({ id: randomUUID(), at: now, author, authorRole, body })
    request.updatedAt = now
    this.save()
    return this.cloneSupportRequest(request)
  }

  claimSupportRequest(id: string, actor: string, at = new Date()): SupportRequest {
    const request = this.state.supportRequests[id]
    if (!request) throw new Error('Support request was not found')
    if (request.status !== 'open' && request.status !== 'claimed') throw new Error('Only open requests can be claimed')
    if (request.claimedBy && request.claimedBy !== actor) throw new Error(`This request is already claimed by ${request.claimedBy}`)
    const now = at.toISOString()
    request.status = 'claimed'
    request.claimedBy = actor
    request.statusUpdatedBy = actor
    request.updatedAt = now
    this.save()
    return this.cloneSupportRequest(request)
  }

  setSupportRequestStatus(id: string, status: SupportRequestStatus, actor: string, at = new Date()): SupportRequest {
    const request = this.state.supportRequests[id]
    if (!request) throw new Error('Support request was not found')
    const allowed: Record<SupportRequestStatus, SupportRequestStatus[]> = {
      open: ['claimed', 'approved', 'denied'],
      claimed: ['open', 'approved', 'denied', 'completed'],
      approved: ['open', 'denied', 'completed'],
      denied: ['open'],
      completed: ['open'],
    }
    if (request.status !== status && !allowed[request.status].includes(status)) {
      throw new Error(`A ${request.status} request cannot move directly to ${status}`)
    }
    const now = at.toISOString()
    request.status = status
    request.statusUpdatedBy = actor
    if (status === 'open') request.claimedBy = undefined
    else if (!request.claimedBy) request.claimedBy = actor
    request.updatedAt = now
    this.save()
    return this.cloneSupportRequest(request)
  }

  getActivity(): ActivityPoint[] {
    return [...this.state.activity]
  }

  addAudit(entry: Omit<AuditEntry, 'id' | 'at'>): AuditEntry {
    const record: AuditEntry = { id: randomUUID(), at: new Date().toISOString(), ...entry }
    this.state.audit.unshift(record)
    this.state.audit = this.state.audit.slice(0, 500)
    this.save()
    return record
  }

  getAudit(limit = 100): AuditEntry[] {
    return this.state.audit.slice(0, Math.min(Math.max(limit, 1), 500))
  }

  updateTelemetry(username: string, telemetry: Omit<PlayerTelemetry, 'updatedAt'>) {
    this.updateTelemetryBatch([{ username, telemetry }])
  }

  updateTelemetryBatch(entries: Array<{ username: string; telemetry: Omit<PlayerTelemetry, 'updatedAt'> }>, at = new Date()) {
    const now = at.toISOString()
    for (const { username, telemetry } of entries) {
      const player = this.state.players[username] ?? {
        username,
        online: false,
        firstSeenAt: now,
        lastSeenAt: now,
        totalOnlineSeconds: 0,
        sessionCount: 0,
      }
      player.telemetry = { ...telemetry, updatedAt: now }
      if (Date.parse(player.lastSeenAt) < at.getTime()) player.lastSeenAt = now
      this.state.players[username] = player
    }
    this.save()
  }

  getStartedAt() {
    return this.state.startedAt
  }
}
