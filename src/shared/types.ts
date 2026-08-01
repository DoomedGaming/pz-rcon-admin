export type ConnectionMode = 'live' | 'demo' | 'offline'
export type DashboardRole = 'user' | 'moderator' | 'admin'
export type PlayerTheme = 'green' | 'amber' | 'blue' | 'violet' | 'rose'

export interface SetupStatus {
  configured: boolean
  available: boolean
  required: boolean
  restartRequired: boolean
}

export interface PlayerSettings {
  theme: PlayerTheme
  updatedAt?: string
}

export type SupportRequestCategory = 'help' | 'unstuck' | 'player-report' | 'safehouse' | 'voice'
export type SupportRequestStatus = 'open' | 'claimed' | 'approved' | 'denied' | 'completed'

export interface SupportRequestLocation {
  x: number
  y: number
  z: number
  observedAt: string
}

export interface SupportRequestMessage {
  id: string
  at: string
  author: string
  authorRole: DashboardRole
  body: string
}

export interface SupportRequest {
  id: string
  category: SupportRequestCategory
  status: SupportRequestStatus
  createdBy: string
  subject: string
  detail: string
  targetUsername?: string
  location?: SupportRequestLocation
  claimedBy?: string
  statusUpdatedBy?: string
  createdAt: string
  updatedAt: string
  messages: SupportRequestMessage[]
}

export interface DashboardUser {
  username: string
  role: DashboardRole
  firstSeenAt: string
  lastSeenAt: string
  lastLoginAt?: string
  roleUpdatedAt?: string
  roleUpdatedBy?: string
}

export interface DashboardSession {
  authenticated: boolean
  identityAuthenticated: boolean
  required: boolean
  username?: string
  role?: DashboardRole
  method?: 'player' | 'bootstrap'
  community: PlayerPortalCommunity
}

export type LiveSettingCategory = 'Access' | 'Chat' | 'PvP' | 'Safehouses' | 'Visibility' | 'Factions' | 'Voice' | 'Anti-grief' | 'Maintenance'

export interface LiveSettingDefinition {
  key: string
  label: string
  description: string
  category: LiveSettingCategory
  kind: 'boolean' | 'integer' | 'decimal'
  impact: 'safe' | 'caution'
  requiresPlayerReconnect?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface LiveSettingState extends LiveSettingDefinition {
  value?: boolean | number
  source: 'live' | 'configured' | 'changed' | 'unavailable'
}

export interface LiveSettingOverride {
  value: boolean | number
  updatedAt: string
  updatedBy: string
}

export interface LiveSettingsSnapshot {
  settings: LiveSettingState[]
  refreshedAt: string
  warning?: string
}

export interface PlayerTelemetry {
  updatedAt: string
  health?: number
  zombieKills?: number
  hoursSurvived?: number
  profession?: string
  position?: { x: number; y: number; z: number }
  abilities?: {
    godMode: boolean
    invisible: boolean
    noClip: boolean
    ghostMode?: boolean
  }
  vehicle?: { keyId: number; script?: string }
  traits?: string[]
  perks?: Record<string, number>
  inventoryWeight?: number
}

export interface SandboxSettingState {
  key: string
  option: string
  category: string
  label: string
  kind: 'boolean' | 'number' | 'string'
  value: boolean | number | string
}

export interface SandboxSettingsSnapshot {
  configured: boolean
  settings: SandboxSettingState[]
  refreshedAt: string
  warning?: string
}

export interface PlayerRecord {
  username: string
  online: boolean
  firstSeenAt: string
  lastSeenAt: string
  currentSessionStartedAt?: string
  totalOnlineSeconds: number
  sessionCount: number
  accessLevel?: string
  telemetry?: PlayerTelemetry
}

export interface PlayerMapRecord {
  username: string
  online: boolean
  telemetry?: Pick<PlayerTelemetry, 'updatedAt' | 'position' | 'health'>
}

export interface ActivityPoint {
  at: string
  online: number
}

export interface AuditEntry {
  id: string
  at: string
  category: 'auth' | 'player' | 'server' | 'world' | 'console' | 'system' | 'telemetry' | 'request'
  action: string
  target?: string
  command?: string
  success: boolean
  detail?: string
}

export interface ConfigSummary {
  name: string
  map: string
  maxPlayers: number
  public: boolean
  open: boolean
  pvp: boolean
  pauseEmpty: boolean
  saveMinutes: number
  backupsOnStart: boolean
  rconPort?: number
  mods: string[]
  workshopItems: string[]
  values: Record<string, string | number | boolean>
}

export interface Overview {
  connection: {
    mode: ConnectionMode
    connected: boolean
    hostConfigured: boolean
    lastConnectedAt?: string
    lastPollAt?: string
    lastError?: string
    pollSeconds: number
  }
  server: {
    name: string
    onlinePlayers: number
    maxPlayers: number
    map: string
    pvp: boolean
    public: boolean
    uptimeSince?: string
  }
  players: PlayerRecord[]
  activity: ActivityPoint[]
  recentAudit: AuditEntry[]
  config: ConfigSummary
  community: PlayerPortalCommunity
  integrations: {
    configFile: boolean
    sandboxFile: boolean
    configSource: 'none' | 'local' | 'ftp'
    configLastSyncAt?: string
    configLastError?: string
    telemetry: boolean
    telemetrySource: 'none' | 'http' | 'ftp'
    telemetryConnected: boolean
    telemetryLastSyncAt?: string
    telemetryLastSnapshotAt?: string
    telemetryLastError?: string
    telemetryPlayers: number
    gameRoles?: string[]
    providerName: string
    providerUrl?: string
  }
}

export interface PlayerPortalServerSummary {
  name: string
  connected: boolean
  onlinePlayers: number
  maxPlayers: number
  map: string
  pvp: boolean
  public: boolean
  lastPollAt?: string
}

export interface PlayerPortalCommunity {
  name: string
  initials: string
  tagline: string
  portalTitle: string
  portalDescription: string
  joinAddress?: string
  discordUrl?: string
  rulesUrl?: string
  modsUrl?: string
  restartSchedule?: string
  announcement?: string
}

export interface PlayerPortalLanding {
  server: PlayerPortalServerSummary
  community: PlayerPortalCommunity
}

export interface PlayerPortalSession {
  authenticated: boolean
  available: boolean
  username?: string
  role?: DashboardRole
  canAccessAdmin: boolean
  landing: PlayerPortalLanding
}

export interface PlayerPortalOverview {
  username: string
  role: DashboardRole
  canAccessAdmin: boolean
  settings: PlayerSettings
  player?: PlayerRecord
  mapPlayers: PlayerMapRecord[]
  server: PlayerPortalServerSummary
  community: PlayerPortalCommunity
  telemetry: {
    available: boolean
    connected: boolean
    lastSyncAt?: string
    lastSnapshotAt?: string
  }
}

export interface CommandDefinition {
  id: string
  label: string
  description: string
  category: 'server' | 'world' | 'weather' | 'maintenance'
  command: string
  args?: Array<{ name: string; label: string; required?: boolean; placeholder?: string }>
  impact: 'safe' | 'caution' | 'danger'
}
