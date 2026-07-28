import { describe, expect, it } from 'vitest'
import { editableSecureConfigState, updateEditableSecureConfig } from '../src/server/configuration-editor.js'
import { buildInitialSecureConfig } from '../src/server/secure-config.js'

const dashboardPassword = 'dashboard-password-at-least-16'
const rconPassword = 'private-rcon-password'

function configured() {
  return buildInitialSecureConfig({
    DASHBOARD_PASSWORD: dashboardPassword,
    PZ_RCON_HOST: 'old.example.test',
    PZ_RCON_PORT: '27015',
    PZ_RCON_PASSWORD: rconPassword,
    PZ_TELEMETRY_TOKEN: 'private-http-token',
    PZ_TELEMETRY_FTP_HOST: 'ftp.example.test',
    PZ_PLAYER_AUTH_ENABLED: 'true',
    PZ_PLAYER_SESSION_SECRET: 'player-session-secret-at-least-32-characters',
    PZ_DISCORD_MOD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_123456',
    PZ_ADMIN_PUBLIC_URL: 'https://pz.example.test',
  })
}

describe('secure configuration editor', () => {
  it('returns editable values without returning secret contents', () => {
    const state = editableSecureConfigState(configured())

    expect(state.values.PZ_RCON_HOST).toBe('old.example.test')
    expect(state.values.PZ_RCON_POLL_SECONDS).toBe('15')
    expect(state.values.PZ_ADMIN_PUBLIC_URL).toBe('https://pz.example.test/')
    expect(state.secretsConfigured).toMatchObject({
      DASHBOARD_PASSWORD: true,
      PZ_RCON_PASSWORD: true,
      PZ_TELEMETRY_TOKEN: true,
      PZ_DISCORD_MOD_WEBHOOK_URL: true,
    })
    expect(JSON.stringify(state)).not.toContain(dashboardPassword)
    expect(JSON.stringify(state)).not.toContain(rconPassword)
    expect(JSON.stringify(state)).not.toContain('private-http-token')
    expect(JSON.stringify(state)).not.toContain('abcdefghijklmnopqrstuvwxyz_123456')
  })

  it('updates plain values while blank secret inputs preserve encrypted secrets', () => {
    const updated = updateEditableSecureConfig(configured(), {
      config: {
        PZ_RCON_HOST: 'new.example.test',
        PZ_RCON_PORT: 27016,
        PZ_RCON_POLL_SECONDS: 5,
        DASHBOARD_PASSWORD: '',
        PZ_RCON_PASSWORD: '',
        UNKNOWN_VALUE: 'ignored',
      },
    })

    expect(updated.PZ_RCON_HOST).toBe('new.example.test')
    expect(updated.PZ_RCON_PORT).toBe('27016')
    expect(updated.PZ_RCON_POLL_SECONDS).toBe('5')
    expect(updated.DASHBOARD_PASSWORD).toBe(dashboardPassword)
    expect(updated.PZ_RCON_PASSWORD).toBe(rconPassword)
    expect(updated).not.toHaveProperty('UNKNOWN_VALUE')
  })

  it('can remove optional secrets and rotate generated session secrets', () => {
    const current = configured()
    const updated = updateEditableSecureConfig(current, {
      config: {},
      clearSecrets: ['PZ_TELEMETRY_TOKEN', 'PZ_PLAYER_SESSION_SECRET', 'DASHBOARD_PASSWORD'],
    })

    expect(updated).not.toHaveProperty('PZ_TELEMETRY_TOKEN')
    expect(updated.PZ_PLAYER_SESSION_SECRET).toHaveLength(43)
    expect(updated.PZ_PLAYER_SESSION_SECRET).not.toBe(current.PZ_PLAYER_SESSION_SECRET)
    expect(updated.DASHBOARD_PASSWORD).toBe(dashboardPassword)
  })

  it('can remove the optional Discord moderator webhook', () => {
    const updated = updateEditableSecureConfig(configured(), {
      config: {},
      clearSecrets: ['PZ_DISCORD_MOD_WEBHOOK_URL'],
    })

    expect(updated).not.toHaveProperty('PZ_DISCORD_MOD_WEBHOOK_URL')
  })

  it('validates the complete merged configuration before saving', () => {
    expect(() => updateEditableSecureConfig(configured(), {
      config: { PZ_RCON_PORT: '70000' },
    })).toThrow('RCON port must be between 1 and 65535')
  })
})
