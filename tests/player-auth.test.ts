import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Request, Response } from 'express'
import { hashSync } from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'
import { createPlayerAuth } from '../src/server/auth.js'
import {
  projectZomboidPasswordDigest,
  projectZomboidPasswordMatches,
  PzPlayerCredentialVerifier,
} from '../src/server/player-auth.js'
import { DashboardStore } from '../src/server/store.js'

const PZ_PASSWORD_MD5 = '5f4dcc3b5aa765d61d8327deb882cf99'

function build42PasswordHash(): string {
  return hashSync(PZ_PASSWORD_MD5, 4).replace('$2b$', '$2a$')
}

describe('Project Zomboid player authentication', () => {
  it('verifies the Build 42 trimmed-MD5-then-bcrypt password format', async () => {
    expect(projectZomboidPasswordDigest('  password  ')).toBe(PZ_PASSWORD_MD5)

    const storedHash = build42PasswordHash()
    expect(storedHash).toMatch(/^\$2a\$04\$/)
    await expect(projectZomboidPasswordMatches('password', storedHash)).resolves.toBe(true)
    await expect(projectZomboidPasswordMatches('wrong password', storedHash)).resolves.toBe(false)
  })

  it('downloads the whitelist database and returns only the canonical local-password account', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-player-auth-test-'))
    const fixturePath = join(directory, 'servertest.db')
    const database = new DatabaseSync(fixturePath)

    try {
      database.exec(`
        CREATE TABLE whitelist (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          world TEXT DEFAULT '' NULL,
          username TEXT NULL,
          password TEXT NULL,
          authType INTEGER NULL DEFAULT 1
        )
      `)
      const insert = database.prepare(`
        INSERT INTO whitelist (world, username, password, authType)
        VALUES (?, ?, ?, ?)
      `)
      const storedHash = build42PasswordHash()
      insert.run('servertest', 'Doom', storedHash, 1)
      insert.run('servertest', 'SteamOnly', storedHash, 2)
      database.close()

      const databaseSize = (await stat(fixturePath)).size
      const clients: Array<{
        ftp: { verbose: boolean }
        access: ReturnType<typeof vi.fn>
        size: ReturnType<typeof vi.fn>
        downloadTo: ReturnType<typeof vi.fn>
        close: ReturnType<typeof vi.fn>
      }> = []
      const verifier = new PzPlayerCredentialVerifier({
        enabled: true,
        host: 'ftp.example.test',
        port: 21,
        user: 'dashboard',
        password: 'ftp-secret',
        secure: false,
        remotePath: 'db/servertest.db',
        world: 'servertest',
      }, () => {
        const client = {
          ftp: { verbose: true },
          access: vi.fn().mockResolvedValue(undefined),
          size: vi.fn().mockResolvedValue(databaseSize),
          downloadTo: vi.fn(async (localPath: string, remotePath: string) => {
            expect(remotePath).toBe('db/servertest.db')
            await copyFile(fixturePath, localPath)
          }),
          close: vi.fn(),
        }
        clients.push(client)
        return client
      })

      await expect(verifier.verify('  dOoM  ', 'password')).resolves.toBe('Doom')
      await expect(verifier.verify('Doom', 'wrong password')).resolves.toBeUndefined()
      await expect(verifier.verify('SteamOnly', 'password')).resolves.toBeUndefined()

      expect(clients).toHaveLength(3)
      for (const client of clients) {
        expect(client.access).toHaveBeenCalledWith(expect.objectContaining({
          host: 'ftp.example.test',
          user: 'dashboard',
          password: 'ftp-secret',
        }))
        expect(client.size).toHaveBeenCalledWith('db/servertest.db')
        expect(client.close).toHaveBeenCalledOnce()
      }
    } finally {
      try {
        database.close()
      } catch {
        // The successful fixture setup closes the database before the verifier copies it.
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('accepts an intact signed player cookie and rejects subject or signature tampering', () => {
    const playerAuth = createPlayerAuth('player-session-secret', true)
    const setHeader = vi.fn()
    playerAuth.login('Doom', { setHeader } as unknown as Response)

    const setCookie = String(setHeader.mock.calls[0]?.[1])
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).toContain('Secure')

    const cookie = setCookie.split(';')[0]
    const encodedToken = cookie.slice(cookie.indexOf('=') + 1)
    const [expires, subject, signature] = decodeURIComponent(encodedToken).split('.')
    const request = (cookieHeader: string) => ({ headers: { cookie: cookieHeader } }) as Request

    expect(playerAuth.username(request(cookie))).toBe('Doom')

    const alteredSubject = Buffer.from('Alice', 'utf8').toString('base64url')
    const subjectTampered = `pz_player_session=${encodeURIComponent(`${expires}.${alteredSubject}.${signature}`)}`
    expect(playerAuth.username(request(subjectTampered))).toBeUndefined()

    const alteredSignature = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`
    const signatureTampered = `pz_player_session=${encodeURIComponent(`${expires}.${subject}.${alteredSignature}`)}`
    expect(playerAuth.username(request(signatureTampered))).toBeUndefined()
  })

  it('looks up only one matching survivor and fails closed on ambiguous casing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-player-store-test-'))
    const store = new DashboardStore(join(directory, 'dashboard.json'))

    try {
      const observedAt = new Date('2026-07-15T18:00:00.000Z')
      store.markPlayersOnline(['Doom', 'Alice'], observedAt)
      store.updateTelemetry('Doom', {
        zombieKills: 42,
        profession: 'Fire Officer',
        position: { x: 11_955.68, y: 6_806, z: 0 },
      })
      store.updateTelemetry('Alice', {
        zombieKills: 999,
        profession: 'Burglar',
        position: { x: 4_000, y: 10_000, z: 2 },
      })

      expect(store.getPlayer('  doom  ', observedAt)).toMatchObject({
        username: 'Doom',
        telemetry: {
          zombieKills: 42,
          profession: 'Fire Officer',
          position: { x: 11_955.68, y: 6_806, z: 0 },
        },
      })
      expect(store.getPlayer('doom', observedAt)?.telemetry?.position).not.toEqual(
        store.getPlayer('Alice', observedAt)?.telemetry?.position,
      )
      expect(store.getPlayer('Unknown', observedAt)).toBeUndefined()

      store.markPlayersOnline(['Doom', 'DOOM', 'Alice'], observedAt)
      expect(store.getPlayer('doom', observedAt)).toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
