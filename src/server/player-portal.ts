import type { PlayerMapRecord, PlayerPortalCommunity, PlayerRecord } from '../shared/types.js'

export function publicText(value: string | undefined, maxLength: number): string {
  return value?.trim().slice(0, maxLength) || ''
}

export function publicHttpUrl(value: string | undefined): string {
  const candidate = value?.trim()
  if (!candidate) return ''
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function initials(value: string): string {
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? []
  if (words.length > 1) return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase()
  return (words[0] ?? 'PZ').slice(0, 2).toUpperCase()
}

export function buildPlayerPortalCommunity(environment: NodeJS.ProcessEnv, serverName = ''): PlayerPortalCommunity {
  const name = publicText(environment.PZ_BRAND_NAME, 80) || publicText(serverName, 80) || 'Project Zomboid'
  const brandInitials = publicText(environment.PZ_BRAND_INITIALS, 4).replace(/[^\p{L}\p{N}]/gu, '').toUpperCase()
  return {
    name,
    initials: brandInitials || initials(name),
    tagline: publicText(environment.PZ_BRAND_TAGLINE, 100) || 'Survivor network',
    portalTitle: publicText(environment.PZ_PORTAL_TITLE, 120) || 'Your life. Your record.',
    portalDescription: publicText(environment.PZ_PORTAL_DESCRIPTION, 240)
      || 'Check the server, jump back in, or open your private character record.',
    joinAddress: publicText(environment.PZ_PLAYER_JOIN_ADDRESS, 160),
    discordUrl: publicHttpUrl(environment.PZ_PLAYER_DISCORD_URL),
    rulesUrl: publicHttpUrl(environment.PZ_PLAYER_RULES_URL),
    modsUrl: publicHttpUrl(environment.PZ_PLAYER_MODS_URL),
    restartSchedule: publicText(environment.PZ_PLAYER_RESTART_SCHEDULE, 160),
    announcement: publicText(environment.PZ_PLAYER_ANNOUNCEMENT, 280),
  }
}

export function buildPlayerMapRoster(players: PlayerRecord[], authenticatedUsername: string): PlayerMapRecord[] {
  const subject = authenticatedUsername.trim().toLocaleLowerCase('en-US')
  const subjectMatches = players.filter((player) => player.username.toLocaleLowerCase('en-US') === subject)
  const canonicalSelf = subjectMatches.length === 1 ? subjectMatches[0].username : undefined
  return players.flatMap((player) => {
    const telemetry = player.telemetry
    const isSelf = player.username === canonicalSelf
    if (!telemetry?.position || (!player.online && !isSelf)) return []
    return [{
      username: player.username,
      online: player.online,
      telemetry: {
        updatedAt: telemetry.updatedAt,
        position: { ...telemetry.position },
        ...(isSelf && telemetry.health !== undefined ? { health: telemetry.health } : {}),
      },
      isSelf,
    }]
  })
    .sort((left, right) => Number(right.isSelf) - Number(left.isSelf) || left.username.localeCompare(right.username))
    .map(({ isSelf: _isSelf, ...player }) => player)
}
