import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DashboardStore } from '../src/server/store.js'

describe('dashboard roles', () => {
  it('defaults every known survivor to User and persists explicit role changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-dashboard-role-test-'))
    const path = join(directory, 'dashboard.json')
    try {
      const store = new DashboardStore(path)
      store.markPlayersOnline(['Doom', 'Alice'], new Date('2026-07-17T12:00:00.000Z'))

      expect(store.getDashboardRole('doom')).toBe('user')
      expect(store.getDashboardUsers()).toEqual(expect.arrayContaining([
        expect.objectContaining({ username: 'Doom', role: 'user' }),
        expect.objectContaining({ username: 'Alice', role: 'user' }),
      ]))

      const updated = store.setDashboardRole('doom', 'admin', 'Bootstrap administrator', new Date('2026-07-17T12:01:00.000Z'))
      expect(updated).toMatchObject({ username: 'Doom', role: 'admin', roleUpdatedBy: 'Bootstrap administrator' })
      expect(new DashboardStore(path).getDashboardRole('DOOM')).toBe('admin')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('registers first-time dashboard logins as User without overwriting an assigned role', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-dashboard-login-test-'))
    try {
      const store = new DashboardStore(join(directory, 'dashboard.json'))
      expect(store.recordDashboardLogin('Doom')).toMatchObject({ username: 'Doom', role: 'user' })
      store.setDashboardRole('Doom', 'moderator', 'Admin')
      expect(store.recordDashboardLogin('Doom')).toMatchObject({ username: 'Doom', role: 'moderator' })
      expect(() => store.setDashboardRole('Unknown', 'admin', 'Admin')).toThrow('not found')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('persists realtime setting overrides without exposing mutable store state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-dashboard-live-settings-test-'))
    const path = join(directory, 'dashboard.json')
    try {
      const store = new DashboardStore(path)
      store.setLiveSettingOverride('ShowFirstAndLastName', false, 'Doom', new Date('2026-07-17T18:00:00.000Z'))

      const overrides = store.getLiveSettingOverrides()
      expect(overrides.ShowFirstAndLastName).toEqual({
        value: false,
        updatedAt: '2026-07-17T18:00:00.000Z',
        updatedBy: 'Doom',
      })

      overrides.ShowFirstAndLastName.value = true
      expect(store.getLiveSettingOverrides().ShowFirstAndLastName.value).toBe(false)
      expect(new DashboardStore(path).getLiveSettingOverrides().ShowFirstAndLastName.value).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('defaults player themes to green and persists them case-insensitively', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-player-settings-test-'))
    const path = join(directory, 'dashboard.json')
    try {
      const store = new DashboardStore(path)
      expect(store.getPlayerSettings('Doom')).toEqual({ theme: 'green' })

      expect(store.setPlayerTheme('Doom', 'violet', new Date('2026-07-17T20:00:00.000Z'))).toEqual({
        theme: 'violet',
        updatedAt: '2026-07-17T20:00:00.000Z',
      })
      expect(store.getPlayerSettings('doom').theme).toBe('violet')
      expect(new DashboardStore(path).getPlayerSettings('DOOM').theme).toBe('violet')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
