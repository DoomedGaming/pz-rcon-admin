import type { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { normalizePlayerTelemetry, parseTelemetrySnapshot, TelemetryFtpBridge } from '../src/server/telemetry.js'

const snapshot = JSON.stringify({
  schemaVersion: 1,
  generatedAt: 1_784_135_200,
  serverName: 'Doomed Gaming',
  players: [{
    username: 'apop',
    telemetry: {
      health: 92.5,
      zombieKills: 48,
      hoursSurvived: 14.25,
      profession: 'Mechanic',
      position: { x: 10_825.5, y: 9_854.25, z: 0 },
      vehicle: { keyId: 42_918, script: 'Base.PickUpVanLights' },
      traits: ['Brave', 'Fast Learner'],
      perks: { Fitness: 5, Mechanics: 4 },
      inventoryWeight: 11.75,
    },
  }],
})

describe('Project Zomboid deep telemetry', () => {
  it('parses and normalizes a Build 42 server snapshot', () => {
    const parsed = parseTelemetrySnapshot(snapshot)
    expect(parsed.serverName).toBe('Doomed Gaming')
    expect(parsed.players).toHaveLength(1)
    expect(parsed.players[0]).toMatchObject({
      username: 'apop',
      telemetry: {
        health: 92.5,
        zombieKills: 48,
        profession: 'Mechanic',
        vehicle: { keyId: 42_918, script: 'Base.PickUpVanLights' },
        perks: { Fitness: 5, Mechanics: 4 },
      },
    })
  })

  it('rejects duplicate players and out-of-range telemetry', () => {
    const duplicate = JSON.stringify({
      schemaVersion: 1,
      generatedAt: 1_784_135_200,
      players: [
        { username: 'same', telemetry: {} },
        { username: 'same', telemetry: {} },
      ],
    })
    expect(() => parseTelemetrySnapshot(duplicate)).toThrow('Duplicate telemetry username')
    expect(() => normalizePlayerTelemetry({ health: 101 })).toThrow('health must be')
  })

  it('converts Build 42 normalized health to a percentage', () => {
    expect(normalizePlayerTelemetry({ health: 1 }).health).toBe(100)
    expect(normalizePlayerTelemetry({ health: 0.425 }).health).toBeCloseTo(42.5)
    expect(normalizePlayerTelemetry({ health: 92.5 }).health).toBe(92.5)
  })

  it('rejects invalid current-vehicle key IDs', () => {
    expect(() => normalizePlayerTelemetry({ vehicle: { keyId: -1 } })).toThrow('vehicle.keyId')
    expect(() => normalizePlayerTelemetry({ vehicle: { keyId: 12.5 } })).toThrow('whole number')
  })

  it('downloads, validates, and imports a snapshot through the FTP bridge', async () => {
    const imported = vi.fn()
    const access = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn()
    const client = {
      ftp: { verbose: true },
      access,
      close,
      downloadTo: vi.fn(async (destination: Writable, remotePath: string) => {
        expect(remotePath).toBe('Lua/PZRconAdminTelemetry/players.json')
        await new Promise<void>((resolve, reject) => destination.end(snapshot, (error?: Error | null) => error ? reject(error) : resolve()))
      }),
    }
    const bridge = new TelemetryFtpBridge({
      host: 'ftp.example.test',
      port: 21,
      user: 'telemetry',
      password: 'secret',
      secure: false,
      remotePath: 'Lua/PZRconAdminTelemetry/players.json',
      pollSeconds: 60,
    }, imported, () => client)

    await expect(bridge.poll()).resolves.toBe(true)
    expect(access).toHaveBeenCalledWith(expect.objectContaining({ host: 'ftp.example.test', password: 'secret' }))
    expect(imported).toHaveBeenCalledOnce()
    expect(bridge.getState()).toMatchObject({ configured: true, connected: true, playerCount: 1 })
    expect(close).toHaveBeenCalledOnce()
  })

  it('reports FTP errors without leaking credentials into the status', async () => {
    const bridge = new TelemetryFtpBridge({
      host: 'ftp.example.test',
      port: 21,
      user: 'telemetry',
      password: 'do-not-leak',
      secure: false,
      remotePath: 'Lua/PZRconAdminTelemetry/players.json',
      pollSeconds: 60,
    }, vi.fn(), () => ({
      ftp: { verbose: true },
      access: vi.fn().mockRejectedValue(new Error('Connection refused')),
      downloadTo: vi.fn(),
      close: vi.fn(),
    }))

    await expect(bridge.poll()).resolves.toBe(false)
    expect(bridge.getState().lastError).toBe('Connection refused')
    expect(JSON.stringify(bridge.getState())).not.toContain('do-not-leak')
  })
})
