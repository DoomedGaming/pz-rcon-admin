import type { LiveSettingDefinition, LiveSettingOverride, LiveSettingsSnapshot, LiveSettingState } from '../shared/types.js'

export const liveSettingDefinitions: LiveSettingDefinition[] = [
  { key: 'Open', label: 'Open registration', description: 'Allow a new username and password to create an account when joining.', category: 'Access', kind: 'boolean', impact: 'caution' },
  { key: 'MaxPlayers', label: 'Maximum players', description: 'Limit simultaneous non-admin connections.', category: 'Access', kind: 'integer', min: 1, max: 100, impact: 'caution' },
  { key: 'PingLimit', label: 'Ping limit', description: 'Kick connections above this latency in milliseconds. Use 0 to disable.', category: 'Access', kind: 'integer', min: 0, max: 2_147_483_647, impact: 'safe' },
  { key: 'DenyLoginOnOverloadedServer', label: 'Reject logins while overloaded', description: 'Prevent new connections while the server is overloaded.', category: 'Access', kind: 'boolean', impact: 'safe' },
  { key: 'LoginQueueEnabled', label: 'Login queue', description: 'Queue connections instead of allowing simultaneous login attempts.', category: 'Access', kind: 'boolean', impact: 'safe' },
  { key: 'LoginQueueConnectTimeout', label: 'Queue timeout', description: 'Seconds a queued connection may take to complete.', category: 'Access', kind: 'integer', min: 20, max: 1200, impact: 'safe' },
  { key: 'MaxAccountsPerUser', label: 'Accounts per Steam user', description: 'Limit usernames per Steam account. Use 0 for unlimited.', category: 'Access', kind: 'integer', min: 0, max: 2_147_483_647, impact: 'safe' },

  { key: 'GlobalChat', label: 'Global chat', description: 'Allow the global chat stream.', category: 'Chat', kind: 'boolean', impact: 'safe' },
  { key: 'AnnounceDeath', label: 'Announce player deaths', description: 'Broadcast player deaths to everyone online.', category: 'Chat', kind: 'boolean', impact: 'safe' },
  { key: 'AnnounceAnimalDeath', label: 'Announce animal deaths', description: 'Broadcast animal deaths to everyone online.', category: 'Chat', kind: 'boolean', impact: 'safe' },
  { key: 'ChatMessageCharacterLimit', label: 'Chat character limit', description: 'Maximum characters accepted in one chat message.', category: 'Chat', kind: 'integer', min: 1, max: 10_000, impact: 'safe' },
  { key: 'ChatMessageSlowModeTime', label: 'Chat slow mode', description: 'Seconds a player must wait between messages. Use 0 to disable.', category: 'Chat', kind: 'integer', min: 0, max: 3600, impact: 'safe' },

  { key: 'PVP', label: 'PvP damage', description: 'Allow players to hurt and kill other players.', category: 'PvP', kind: 'boolean', impact: 'caution' },
  { key: 'SafetySystem', label: 'PvP safety system', description: 'Allow players to opt in and out of PvP safety.', category: 'PvP', kind: 'boolean', impact: 'caution' },
  { key: 'ShowSafety', label: 'Show safety indicator', description: 'Display the PvP safety icon over players.', category: 'PvP', kind: 'boolean', impact: 'safe' },
  { key: 'SafetyToggleTimer', label: 'Safety toggle delay', description: 'Seconds required to enter or leave PvP mode.', category: 'PvP', kind: 'integer', min: 0, max: 1000, impact: 'caution' },
  { key: 'SafetyCooldownTimer', label: 'Safety cooldown', description: 'Seconds before PvP safety can be changed again.', category: 'PvP', kind: 'integer', min: 0, max: 1000, impact: 'caution' },

  { key: 'PlayerSafehouse', label: 'Player safehouses', description: 'Allow players to claim safehouses.', category: 'Safehouses', kind: 'boolean', impact: 'caution' },
  { key: 'AdminSafehouse', label: 'Admin safehouses', description: 'Allow administrators to claim safehouses.', category: 'Safehouses', kind: 'boolean', impact: 'safe' },
  { key: 'SafehouseAllowTrepass', label: 'Allow trespassing', description: 'Allow non-members to enter claimed safehouses.', category: 'Safehouses', kind: 'boolean', impact: 'caution' },
  { key: 'SafehouseAllowLoot', label: 'Allow outsider looting', description: 'Allow non-members to take items from safehouses.', category: 'Safehouses', kind: 'boolean', impact: 'caution' },
  { key: 'SafehouseAllowFire', label: 'Allow safehouse fire damage', description: 'Allow fire to damage safehouses.', category: 'Safehouses', kind: 'boolean', impact: 'caution' },
  { key: 'SafehouseAllowRespawn', label: 'Safehouse respawn', description: 'Allow members to respawn in their safehouse.', category: 'Safehouses', kind: 'boolean', impact: 'safe' },
  { key: 'SafehouseDaySurvivedToClaim', label: 'Days before claiming', description: 'In-game days a survivor must live before claiming a safehouse.', category: 'Safehouses', kind: 'integer', min: 0, max: 2_147_483_647, impact: 'safe' },
  { key: 'SafeHouseRemovalTime', label: 'Inactive removal time', description: 'Real-world hours before an unvisited safehouse is removed.', category: 'Safehouses', kind: 'integer', min: 0, max: 2_147_483_647, impact: 'caution' },

  { key: 'DisplayUserName', label: 'Display usernames', description: 'Show account usernames as persistent overhead nameplates.', category: 'Visibility', kind: 'boolean', impact: 'safe', requiresPlayerReconnect: true },
  { key: 'ShowFirstAndLastName', label: 'Display character names', description: 'Show character first and last names as persistent overhead nameplates. Mouse-over names are controlled separately.', category: 'Visibility', kind: 'boolean', impact: 'safe', requiresPlayerReconnect: true },
  { key: 'MouseOverToSeeDisplayName', label: 'Show names on mouse-over', description: 'Reveal a survivor’s display name while the cursor is over them. Disable this too when hiding names.', category: 'Visibility', kind: 'boolean', impact: 'safe', requiresPlayerReconnect: true },
  { key: 'DisableScoreboard', label: 'Disable scoreboard', description: 'Hide the server player list from regular players.', category: 'Visibility', kind: 'boolean', impact: 'safe' },
  { key: 'HideAdminsInPlayerList', label: 'Hide admins in player list', description: 'Keep in-game administrators off the player list.', category: 'Visibility', kind: 'boolean', impact: 'safe' },

  { key: 'Faction', label: 'Player factions', description: 'Allow survivors to create and join factions.', category: 'Factions', kind: 'boolean', impact: 'caution' },
  { key: 'FactionDaySurvivedToCreate', label: 'Days before creating', description: 'In-game days a survivor must live before creating a faction.', category: 'Factions', kind: 'integer', min: 0, max: 2_147_483_647, impact: 'safe', unit: 'days' },
  { key: 'FactionPlayersRequiredForTag', label: 'Members required for tag', description: 'Faction members required before its owner can create a group tag.', category: 'Factions', kind: 'integer', min: 1, max: 2_147_483_647, impact: 'safe', unit: 'players' },

  { key: 'VoiceEnable', label: 'Voice chat', description: 'Allow survivors to communicate through in-game voice chat.', category: 'Voice', kind: 'boolean', impact: 'safe' },
  { key: 'VoiceMinDistance', label: 'Full-volume distance', description: 'Tile distance at which voice chat begins to fade with range.', category: 'Voice', kind: 'decimal', min: 0, max: 100_000, step: 0.1, unit: 'tiles', impact: 'safe' },
  { key: 'VoiceMaxDistance', label: 'Maximum voice distance', description: 'Farthest tile distance at which voice chat can be heard.', category: 'Voice', kind: 'decimal', min: 0, max: 100_000, step: 0.1, unit: 'tiles', impact: 'safe' },
  { key: 'Voice3D', label: 'Directional voice audio', description: 'Position voice chat in stereo according to the speaker’s direction.', category: 'Voice', kind: 'boolean', impact: 'safe' },

  { key: 'NoFire', label: 'Disable destructive fire', description: 'Disable every form of fire except campfires.', category: 'Anti-grief', kind: 'boolean', impact: 'caution' },
  { key: 'AllowDestructionBySledgehammer', label: 'Sledgehammer destruction', description: 'Allow players to destroy world objects with sledgehammers.', category: 'Anti-grief', kind: 'boolean', impact: 'caution' },
  { key: 'SledgehammerOnlyInSafehouse', label: 'Limit sledgehammers to safehouses', description: 'Restrict sledgehammer destruction to a player’s own safehouse.', category: 'Anti-grief', kind: 'boolean', impact: 'caution' },
  { key: 'ItemNumbersLimitPerContainer', label: 'Items per container', description: 'Maximum individual items allowed in one container. Use 0 for unlimited.', category: 'Anti-grief', kind: 'integer', min: 0, max: 9_000, unit: 'items', impact: 'caution' },
  { key: 'DisableVehicleTowing', label: 'Disable vehicle towing', description: 'Prevent players from towing other vehicles.', category: 'Anti-grief', kind: 'boolean', impact: 'safe' },
  { key: 'DisableTrailerTowing', label: 'Disable trailer towing', description: 'Prevent players from attaching and towing trailers.', category: 'Anti-grief', kind: 'boolean', impact: 'safe' },
  { key: 'DisableBurntTowing', label: 'Disable burnt-vehicle towing', description: 'Prevent players from towing burnt vehicle wrecks.', category: 'Anti-grief', kind: 'boolean', impact: 'safe' },
  { key: 'BanKickGlobalSound', label: 'Ban and kick sound', description: 'Play the global notification sound for moderation actions.', category: 'Anti-grief', kind: 'boolean', impact: 'safe' },

  { key: 'PauseEmpty', label: 'Pause while empty', description: 'Pause game time when no players are connected.', category: 'Maintenance', kind: 'boolean', impact: 'safe' },
  { key: 'SaveWorldEveryMinutes', label: 'Automatic save interval', description: 'Minutes between automatic world saves. Use 0 for normal area-unload saving only.', category: 'Maintenance', kind: 'integer', min: 0, max: 2_147_483_647, impact: 'safe' },
]

const definitionByKey = new Map(liveSettingDefinitions.map((definition) => [definition.key, definition]))

function deserialize(definition: LiveSettingDefinition, value: unknown): boolean | number | undefined {
  if (definition.kind === 'boolean') {
    if (value === true || String(value).toLowerCase() === 'true') return true
    if (value === false || String(value).toLowerCase() === 'false') return false
    return undefined
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(parsed)) return undefined
  if (definition.kind === 'integer' && !Number.isInteger(parsed)) return undefined
  if (definition.min !== undefined && parsed < definition.min) return undefined
  if (definition.max !== undefined && parsed > definition.max) return undefined
  return parsed
}

export function parseShowOptions(output: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*[*-]?\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2]
  }
  return values
}

export function validateLiveSettingOutput(output: string): string {
  if (/unknown (?:option|command)|option .* not found|invalid (?:option|value)|failed|error:/i.test(output)) {
    throw new Error('Project Zomboid rejected that live setting change')
  }
  return output
}

export class LiveSettingsService {
  private readonly values = new Map<string, { value: boolean | number; source: LiveSettingState['source'] }>()

  constructor(configuredValues: Record<string, string | number | boolean>, overrides: Record<string, LiveSettingOverride> = {}) {
    this.importConfigured(configuredValues)
    for (const definition of liveSettingDefinitions) {
      const value = deserialize(definition, overrides[definition.key]?.value)
      if (value !== undefined) this.values.set(definition.key, { value, source: 'changed' })
    }
  }

  importConfigured(configuredValues: Record<string, string | number | boolean>) {
    for (const definition of liveSettingDefinitions) {
      const current = this.values.get(definition.key)
      if (current && current.source !== 'configured') continue
      const value = deserialize(definition, configuredValues[definition.key])
      if (value !== undefined) this.values.set(definition.key, { value, source: 'configured' })
      else if (current?.source === 'configured') this.values.delete(definition.key)
    }
  }

  async snapshot(send: (command: string) => Promise<string>): Promise<LiveSettingsSnapshot> {
    let warning: string | undefined
    try {
      const liveValues = parseShowOptions(await send('showoptions'))
      for (const definition of liveSettingDefinitions) {
        const value = deserialize(definition, liveValues[definition.key])
        if (value !== undefined) this.values.set(definition.key, { value, source: 'live' })
      }
    } catch {
      warning = 'Live values could not be refreshed. Configured values are shown where available.'
    }
    return { settings: this.states(), refreshedAt: new Date().toISOString(), warning }
  }

  buildChange(key: string, input: unknown): { definition: LiveSettingDefinition; value: boolean | number; command: string } {
    const definition = definitionByKey.get(key)
    if (!definition) throw new Error('This server option is not available as a dashboard live setting')
    const value = deserialize(definition, input)
    if (value === undefined) {
      const range = definition.kind === 'boolean' ? '' : ` from ${definition.min} to ${definition.max}`
      throw new Error(`${definition.label} must be a valid ${definition.kind}${range}`)
    }
    if (key === 'VoiceMinDistance') {
      const maximum = this.values.get('VoiceMaxDistance')?.value
      if (typeof maximum === 'number' && typeof value === 'number' && value > maximum) {
        throw new Error('Full-volume distance cannot exceed maximum voice distance')
      }
    }
    if (key === 'VoiceMaxDistance') {
      const minimum = this.values.get('VoiceMinDistance')?.value
      if (typeof minimum === 'number' && typeof value === 'number' && value < minimum) {
        throw new Error('Maximum voice distance cannot be less than full-volume distance')
      }
    }
    return { definition, value, command: `changeoption ${definition.key} "${String(value)}"` }
  }

  commit(key: string, value: boolean | number): LiveSettingState {
    this.values.set(key, { value, source: 'changed' })
    return this.states().find((setting) => setting.key === key)!
  }

  private states(): LiveSettingState[] {
    return liveSettingDefinitions.map((definition) => ({
      ...definition,
      value: this.values.get(definition.key)?.value,
      source: this.values.get(definition.key)?.source ?? 'unavailable',
    }))
  }
}
