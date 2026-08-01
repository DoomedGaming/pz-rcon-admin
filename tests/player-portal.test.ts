import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildPlayerMapRoster, buildPlayerPortalCommunity } from '../src/server/player-portal.js'

const playerPortalSource = readFileSync(new URL('../src/client/PlayerPortal.vue', import.meta.url), 'utf8')

describe('player portal request form', () => {
  it('explains request length requirements and reports progress before enabling submit', () => {
    expect(playerPortalSource).toContain('SUPPORT_REQUEST_SUBJECT_MIN_LENGTH')
    expect(playerPortalSource).toContain('SUPPORT_REQUEST_DETAIL_MIN_LENGTH')
    expect(playerPortalSource).toContain('request-subject-progress')
    expect(playerPortalSource).toContain('request-detail-progress')
    expect(playerPortalSource).toContain("requestBusy === 'create' || !canSubmitSupportRequest")
  })

  it('passes the reported server build to the survivor map', () => {
    expect(playerPortalSource).toContain(':server-version="portal.server.serverVersion"')
  })

  it('warns on the login form that Project Zomboid usernames are case-sensitive', () => {
    expect(playerPortalSource).toContain('Username casing matters:')
    expect(playerPortalSource).toContain('<code>howop</code> and <code>Howop</code> are different accounts.')
    expect(playerPortalSource).toContain("'player-username-help player-login-error'")
  })
})

describe('player portal community configuration', () => {
  it('keeps operator-provided join information and normalizes safe web links', () => {
    expect(buildPlayerPortalCommunity({
      PZ_BRAND_NAME: 'Knox County Friends',
      PZ_BRAND_INITIALS: 'KCF',
      PZ_BRAND_TAGLINE: 'No one survives alone',
      PZ_PORTAL_TITLE: 'Welcome home, survivor.',
      PZ_PORTAL_DESCRIPTION: 'See who is online and review your latest character snapshot.',
      PZ_PLAYER_JOIN_ADDRESS: '  friends.example.test:16261  ',
      PZ_PLAYER_DISCORD_URL: 'https://discord.gg/example',
      PZ_PLAYER_RULES_URL: 'http://friends.example.test/rules',
      PZ_PLAYER_MODS_URL: 'https://steamcommunity.com/sharedfiles/filedetails/?id=123',
      PZ_PLAYER_RESTART_SCHEDULE: '  Nightly at 4 AM  ',
      PZ_PLAYER_ANNOUNCEMENT: '  Bring snacks.  ',
    })).toEqual({
      name: 'Knox County Friends',
      initials: 'KCF',
      tagline: 'No one survives alone',
      portalTitle: 'Welcome home, survivor.',
      portalDescription: 'See who is online and review your latest character snapshot.',
      joinAddress: 'friends.example.test:16261',
      discordUrl: 'https://discord.gg/example',
      rulesUrl: 'http://friends.example.test/rules',
      modsUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=123',
      restartSchedule: 'Nightly at 4 AM',
      announcement: 'Bring snacks.',
    })
  })

  it('uses the configured server name and safe generic branding defaults', () => {
    expect(buildPlayerPortalCommunity({}, 'Rosewood After Dark')).toMatchObject({
      name: 'Rosewood After Dark',
      initials: 'RAD',
      tagline: 'Survivor network',
      portalTitle: 'Your life. Your record.',
    })
  })

  it('drops unsafe or malformed links and limits public text lengths', () => {
    const community = buildPlayerPortalCommunity({
      PZ_PLAYER_JOIN_ADDRESS: 'x'.repeat(200),
      PZ_PLAYER_DISCORD_URL: 'javascript:alert(1)',
      PZ_PLAYER_RULES_URL: 'not a url',
      PZ_PLAYER_MODS_URL: 'ftp://example.test/mods',
      PZ_PLAYER_RESTART_SCHEDULE: 's'.repeat(200),
      PZ_PLAYER_ANNOUNCEMENT: 'a'.repeat(400),
    })

    expect(community.joinAddress).toHaveLength(160)
    expect(community.restartSchedule).toHaveLength(160)
    expect(community.announcement).toHaveLength(280)
    expect(community.discordUrl).toBe('')
    expect(community.rulesUrl).toBe('')
    expect(community.modsUrl).toBe('')
  })
})

describe('player portal map roster', () => {
  it('shows the signed-in survivor and positioned online players without exposing other character stats', () => {
    const at = '2026-07-16T12:00:00.000Z'
    const players = [
      {
        username: 'Doom', online: false, firstSeenAt: at, lastSeenAt: at, totalOnlineSeconds: 100, sessionCount: 1,
        telemetry: {
          updatedAt: at,
          position: { x: 11_956, y: 6_805, z: 0 },
          health: 82,
          zombieKills: 50,
          perks: { Fitness: 4 },
        },
      },
      {
        username: 'Alice', online: true, firstSeenAt: at, lastSeenAt: at, totalOnlineSeconds: 200, sessionCount: 2,
        telemetry: {
          updatedAt: at,
          position: { x: 10_100, y: 9_800, z: 1 },
          health: 47,
          zombieKills: 900,
          perks: { Fitness: 9 },
        },
      },
      {
        username: 'OfflineOther', online: false, firstSeenAt: at, lastSeenAt: at, totalOnlineSeconds: 300, sessionCount: 3,
        telemetry: { updatedAt: at, position: { x: 5_000, y: 5_000, z: 0 }, health: 100 },
      },
      {
        username: 'NoPosition', online: true, firstSeenAt: at, lastSeenAt: at, totalOnlineSeconds: 400, sessionCount: 4,
        telemetry: { updatedAt: at, health: 100 },
      },
    ]

    const roster = buildPlayerMapRoster(players, ' Doom ')

    expect(roster).toEqual([
      {
        username: 'Doom',
        online: false,
        telemetry: { updatedAt: at, position: { x: 11_956, y: 6_805, z: 0 }, health: 82 },
      },
      {
        username: 'Alice',
        online: true,
        telemetry: { updatedAt: at, position: { x: 10_100, y: 9_800, z: 1 } },
      },
    ])
    expect(JSON.stringify(roster)).not.toContain('zombieKills')
    expect(JSON.stringify(roster)).not.toContain('Fitness')
    expect(JSON.stringify(roster)).not.toContain('OfflineOther')
  })

  it('shows only the exact signed-in casing as the offline self record', () => {
    const at = '2026-07-16T12:00:00.000Z'
    const player = (username: string) => ({
      username,
      online: false,
      firstSeenAt: at,
      lastSeenAt: at,
      totalOnlineSeconds: 0,
      sessionCount: 1,
      telemetry: { updatedAt: at, position: { x: 10_000, y: 10_000, z: 0 }, health: 100 },
    })

    expect(buildPlayerMapRoster([player('Doom'), player('DOOM')], 'Doom')).toEqual([{
      username: 'Doom',
      online: false,
      telemetry: { updatedAt: at, position: { x: 10_000, y: 10_000, z: 0 }, health: 100 },
    }])
  })
})
