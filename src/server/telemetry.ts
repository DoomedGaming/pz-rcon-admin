import { Writable } from 'node:stream'
import { Client, type AccessOptions } from 'basic-ftp'
import type { PlayerTelemetry } from '../shared/types.js'

const MAX_SNAPSHOT_BYTES = 512 * 1024
const MAX_PLAYERS = 256

export interface TelemetrySnapshotPlayer {
  username: string
  telemetry: Omit<PlayerTelemetry, 'updatedAt'>
}

export interface TelemetrySnapshot {
  schemaVersion: 1
  generatedAt: number
  serverName?: string
  serverVersion?: string
  roles: string[]
  players: TelemetrySnapshotPlayer[]
}

export interface TelemetryFtpConfig {
  host: string
  port: number
  user: string
  password: string
  secure: AccessOptions['secure']
  remotePath: string
  pollSeconds: number
}

export interface TelemetryBridgeState {
  configured: boolean
  connected: boolean
  remotePath?: string
  lastCheckedAt?: string
  lastSyncAt?: string
  lastSnapshotAt?: string
  lastError?: string
  playerCount: number
  serverVersion?: string
}

interface FtpClient {
  ftp: { verbose: boolean }
  access(options: AccessOptions): Promise<unknown>
  downloadTo(destination: Writable, remotePath: string): Promise<unknown>
  close(): void
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, unknown>
}

function optionalNumber(value: unknown, name: string, minimum: number, maximum: number): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a finite number between ${minimum} and ${maximum}`)
  }
  return value
}

function optionalText(value: unknown, name: string, maximumLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${name} must be text`)
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maximumLength) throw new Error(`${name} must be 1-${maximumLength} characters`)
  return trimmed
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`)
  return value
}

export function normalizePlayerTelemetry(value: unknown): Omit<PlayerTelemetry, 'updatedAt'> {
  const input = record(value)
  const output: Omit<PlayerTelemetry, 'updatedAt'> = {}

  const health = optionalNumber(input.health, 'health', 0, 100)
  // IsoGameCharacter:getHealth() is normalized to 0-1 in Build 42. Accept
  // percentage-valued custom senders too, while presenting one 0-100 scale.
  output.health = health !== undefined && health <= 1 ? health * 100 : health
  output.zombieKills = optionalNumber(input.zombieKills, 'zombieKills', 0, 10_000_000)
  output.hoursSurvived = optionalNumber(input.hoursSurvived, 'hoursSurvived', 0, 10_000_000)
  output.inventoryWeight = optionalNumber(input.inventoryWeight, 'inventoryWeight', 0, 1_000_000)
  output.profession = optionalText(input.profession, 'profession', 128)

  if (input.position !== undefined && input.position !== null) {
    const position = record(input.position)
    const x = optionalNumber(position.x, 'position.x', -10_000_000, 10_000_000)
    const y = optionalNumber(position.y, 'position.y', -10_000_000, 10_000_000)
    const z = optionalNumber(position.z, 'position.z', -100, 100)
    if (x === undefined || y === undefined || z === undefined) throw new Error('position requires x, y, and z')
    output.position = { x, y, z }
  }

  if (input.abilities !== undefined && input.abilities !== null) {
    const abilities = record(input.abilities)
    output.abilities = {
      godMode: requiredBoolean(abilities.godMode, 'abilities.godMode'),
      invisible: requiredBoolean(abilities.invisible, 'abilities.invisible'),
      noClip: requiredBoolean(abilities.noClip, 'abilities.noClip'),
      ...(abilities.ghostMode === undefined ? {} : { ghostMode: requiredBoolean(abilities.ghostMode, 'abilities.ghostMode') }),
    }
  }

  if (input.vehicle !== undefined && input.vehicle !== null) {
    const vehicle = record(input.vehicle)
    const keyId = optionalNumber(vehicle.keyId, 'vehicle.keyId', 0, 2_147_483_647)
    if (keyId === undefined || !Number.isInteger(keyId)) throw new Error('vehicle.keyId must be a whole number')
    output.vehicle = {
      keyId,
      script: optionalText(vehicle.script, 'vehicle.script', 128),
    }
  }

  if (input.traits !== undefined && input.traits !== null) {
    if (!Array.isArray(input.traits) || input.traits.length > 128) throw new Error('traits must be an array with at most 128 entries')
    output.traits = input.traits.map((trait, index) => {
      const normalized = optionalText(trait, `traits[${index}]`, 128)
      if (!normalized) throw new Error(`traits[${index}] cannot be empty`)
      return normalized
    })
  }

  if (input.perks !== undefined && input.perks !== null) {
    const perks = record(input.perks)
    if (Object.keys(perks).length > 256) throw new Error('perks may contain at most 256 entries')
    output.perks = {}
    for (const [name, level] of Object.entries(perks)) {
      if (!name.trim() || name.length > 128) throw new Error('perk names must be 1-128 characters')
      const normalized = optionalNumber(level, `perks.${name}`, 0, 100)
      if (normalized === undefined) throw new Error(`perks.${name} is required`)
      output.perks[name] = normalized
    }
  }

  return Object.fromEntries(Object.entries(output).filter(([, entry]) => entry !== undefined))
}

export function parseTelemetrySnapshot(text: string): TelemetrySnapshot {
  if (Buffer.byteLength(text, 'utf8') > MAX_SNAPSHOT_BYTES) throw new Error('Telemetry snapshot exceeds 512 KiB')
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    throw new Error('Telemetry snapshot is not valid JSON')
  }

  const input = record(decoded)
  if (input.schemaVersion !== 1) throw new Error('Unsupported telemetry schema version')
  if (typeof input.generatedAt !== 'number' || !Number.isSafeInteger(input.generatedAt) || input.generatedAt <= 0) {
    throw new Error('generatedAt must be a positive Unix timestamp')
  }
  if (!Array.isArray(input.players) || input.players.length > MAX_PLAYERS) {
    throw new Error(`players must be an array with at most ${MAX_PLAYERS} entries`)
  }

  const usernames = new Set<string>()
  const players = input.players.map((entry, index) => {
    const player = record(entry)
    const username = optionalText(player.username, `players[${index}].username`, 64)
    if (!username) throw new Error(`players[${index}].username is required`)
    if (usernames.has(username)) throw new Error(`Duplicate telemetry username: ${username}`)
    usernames.add(username)
    return { username, telemetry: normalizePlayerTelemetry(player.telemetry) }
  })

  const roles = input.roles === undefined
    ? []
    : (() => {
        if (!Array.isArray(input.roles) || input.roles.length > 64) throw new Error('roles must be an array with at most 64 entries')
        const unique = new Set<string>()
        return input.roles.map((role, index) => {
          const normalized = optionalText(role, `roles[${index}]`, 64)
          if (!normalized || !/^\w+$/.test(normalized)) throw new Error(`roles[${index}] must be a valid role name`)
          if (unique.has(normalized.toLowerCase())) throw new Error(`Duplicate telemetry role: ${normalized}`)
          unique.add(normalized.toLowerCase())
          return normalized
        })
      })()

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    serverName: optionalText(input.serverName, 'serverName', 128),
    serverVersion: optionalText(input.serverVersion, 'serverVersion', 64),
    roles,
    players,
  }
}

function timestampToIso(timestamp: number): string {
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000
  const date = new Date(milliseconds)
  if (!Number.isFinite(date.getTime())) throw new Error('generatedAt is outside the supported date range')
  return date.toISOString()
}

class LimitedTextSink extends Writable {
  private readonly chunks: Buffer[] = []
  private size = 0

  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    this.size += bytes.length
    if (this.size > MAX_SNAPSHOT_BYTES) return callback(new Error('Telemetry snapshot exceeds 512 KiB'))
    this.chunks.push(bytes)
    callback()
  }

  text() {
    return Buffer.concat(this.chunks).toString('utf8')
  }
}

export class TelemetryFtpBridge {
  private inFlight = false
  private lastSnapshotKey = ''
  private readonly configured: boolean
  private readonly state: TelemetryBridgeState

  constructor(
    private readonly config: TelemetryFtpConfig,
    private readonly importSnapshot: (snapshot: TelemetrySnapshot, observedAt: Date) => Promise<void> | void,
    private readonly clientFactory: () => FtpClient = () => new Client(),
  ) {
    this.configured = Boolean(config.host && config.user && config.password && config.remotePath)
    this.state = {
      configured: this.configured,
      connected: false,
      remotePath: this.configured ? config.remotePath : undefined,
      playerCount: 0,
    }
  }

  getState(): TelemetryBridgeState {
    return { ...this.state }
  }

  async poll(): Promise<boolean> {
    if (!this.configured || this.inFlight) return false
    this.inFlight = true
    const client = this.clientFactory()
    const checkedAt = new Date()
    this.state.lastCheckedAt = checkedAt.toISOString()

    try {
      client.ftp.verbose = false
      await client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        secure: this.config.secure,
      })
      const sink = new LimitedTextSink()
      await client.downloadTo(sink, this.config.remotePath)
      const snapshot = parseTelemetrySnapshot(sink.text())
      this.state.serverVersion = snapshot.serverVersion
      const snapshotKey = `${snapshot.generatedAt}:${snapshot.players.length}`
      if (snapshotKey !== this.lastSnapshotKey) {
        const observedAt = new Date(snapshot.generatedAt > 10_000_000_000 ? snapshot.generatedAt : snapshot.generatedAt * 1000)
        await this.importSnapshot(snapshot, observedAt)
        this.lastSnapshotKey = snapshotKey
        this.state.lastSyncAt = new Date().toISOString()
        this.state.lastSnapshotAt = timestampToIso(snapshot.generatedAt)
        this.state.playerCount = snapshot.players.length
      }
      this.state.connected = true
      this.state.lastError = undefined
      return true
    } catch (error) {
      this.state.connected = false
      this.state.lastError = error instanceof Error ? error.message : 'Telemetry FTP sync failed'
      return false
    } finally {
      client.close()
      this.inFlight = false
    }
  }
}
