import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DashboardStore } from '../src/server/store.js'

describe('dashboard roles', () => {
  it('preserves each unreadable data file under a unique recovery name', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-dashboard-corruption-test-'))
    const path = join(directory, 'dashboard.json')
    const previousBackup = `${path}.corrupted-existing`
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await writeFile(previousBackup, 'older recovery copy')
      await writeFile(path, '{not valid json')

      new DashboardStore(path)

      const recoveryFiles = (await readdir(directory)).filter((entry) => entry.startsWith('dashboard.json.corrupted-'))
      expect(recoveryFiles).toHaveLength(2)
      expect(await readFile(previousBackup, 'utf8')).toBe('older recovery copy')
      const latestBackup = recoveryFiles.find((entry) => entry !== 'dashboard.json.corrupted-existing')
      expect(latestBackup).toBeDefined()
      expect(await readFile(join(directory, latestBackup!), 'utf8')).toBe('{not valid json')
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('could not be read; the file was moved to'))
    } finally {
      warning.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('defaults every known survivor to User and persists explicit role changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-dashboard-role-test-'))
    const path = join(directory, 'dashboard.json')
    try {
      const store = new DashboardStore(path)
      store.markPlayersOnline(['Doom', 'Alice'], new Date('2026-07-17T12:00:00.000Z'))

      expect(store.getDashboardRole('Doom')).toBe('user')
      expect(store.getDashboardUsers()).toEqual(expect.arrayContaining([
        expect.objectContaining({ username: 'Doom', role: 'user' }),
        expect.objectContaining({ username: 'Alice', role: 'user' }),
      ]))

      const updated = store.setDashboardRole('Doom', 'admin', 'Bootstrap administrator', new Date('2026-07-17T12:01:00.000Z'))
      expect(updated).toMatchObject({ username: 'Doom', role: 'admin', roleUpdatedBy: 'Bootstrap administrator' })
      expect(new DashboardStore(path).getDashboardRole('Doom')).toBe('admin')
      expect(new DashboardStore(path).getDashboardRole('DOOM')).toBe('user')
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

  it('keeps player themes separate for usernames that differ only by casing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-player-settings-test-'))
    const path = join(directory, 'dashboard.json')
    try {
      const store = new DashboardStore(path)
      expect(store.getPlayerSettings('Doom')).toEqual({ theme: 'green' })

      expect(store.setPlayerTheme('Doom', 'violet', new Date('2026-07-17T20:00:00.000Z'))).toEqual({
        theme: 'violet',
        updatedAt: '2026-07-17T20:00:00.000Z',
      })
      expect(store.setPlayerTheme('doom', 'amber').theme).toBe('amber')
      expect(store.getPlayerSettings('Doom').theme).toBe('violet')
      expect(store.getPlayerSettings('doom').theme).toBe('amber')
      expect(new DashboardStore(path).getPlayerSettings('DOOM').theme).toBe('green')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('removes an offline survivor and their dashboard identity without touching a casing variant', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-dashboard-remove-test-'))
    const path = join(directory, 'dashboard.json')
    try {
      const store = new DashboardStore(path)
      store.markPlayersOnline(['howop', 'Howop'], new Date('2026-07-17T20:00:00.000Z'))
      store.recordDashboardLogin('howop')
      store.setDashboardRole('howop', 'moderator', 'Admin')
      store.setPlayerTheme('howop', 'violet')

      expect(() => store.removeDashboardPlayer('howop')).toThrow('Online survivors')
      store.markPlayersOnline([], new Date('2026-07-17T20:05:00.000Z'))
      expect(store.removeDashboardPlayer('howop').username).toBe('howop')

      expect(store.getPlayer('howop')).toBeUndefined()
      expect(store.getDashboardUsers().some((user) => user.username === 'howop')).toBe(false)
      expect(store.getDashboardRole('howop')).toBe('user')
      expect(store.getPlayerSettings('howop').theme).toBe('green')
      expect(store.getPlayer('Howop')?.username).toBe('Howop')
      expect(new DashboardStore(path).getPlayer('Howop')?.username).toBe('Howop')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
