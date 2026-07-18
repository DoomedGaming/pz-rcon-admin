import { Rcon } from 'rcon-client'
import type { ConnectionMode } from '../shared/types.js'

export interface RconSettings {
  host: string
  port: number
  password: string
  pollSeconds: number
  demo: boolean
}

export interface ConnectionState {
  mode: ConnectionMode
  connected: boolean
  hostConfigured: boolean
  lastConnectedAt?: string
  lastPollAt?: string
  lastError?: string
  pollSeconds: number
}

export function parsePlayersResponse(response: string): string[] {
  const lines = response.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const names: string[] = []
  for (const line of lines) {
    if (/players? connected/i.test(line) || /^players?:?$/i.test(line) || /^\d+$/.test(line)) continue
    const cleaned = line
      .replace(/^[-*]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^username\s*[:=]\s*/i, '')
      .trim()
    if (cleaned && !/no players/i.test(cleaned)) names.push(cleaned)
  }
  return [...new Set(names)]
}

export class PzRconService {
  private state: ConnectionState
  private queue: Promise<unknown> = Promise.resolve()
  private demoPlayers = ['MuldraughMedic', 'LastCanOpener']

  constructor(private readonly settings: RconSettings) {
    const configured = Boolean(settings.host && settings.port && settings.password)
    this.state = {
      mode: settings.demo ? 'demo' : configured ? 'live' : 'offline',
      connected: settings.demo,
      hostConfigured: configured,
      pollSeconds: settings.pollSeconds,
      lastConnectedAt: settings.demo ? new Date().toISOString() : undefined,
    }
  }

  getState(): ConnectionState {
    return { ...this.state }
  }

  async send(command: string): Promise<string> {
    const task = this.queue.then(() => this.execute(command), () => this.execute(command))
    this.queue = task.then(() => undefined, () => undefined)
    return task
  }

  private async execute(command: string): Promise<string> {
    if (this.settings.demo) {
      this.state.connected = true
      this.state.lastConnectedAt = new Date().toISOString()
      if (command.toLowerCase() === 'players') {
        return `Players connected (${this.demoPlayers.length}):\n${this.demoPlayers.map((name) => `-${name}`).join('\n')}`
      }
      if (command.toLowerCase() === 'statistics') return 'Demo statistics: server healthy'
      return `[demo] Executed: ${command}`
    }
    if (!this.state.hostConfigured) throw new Error('RCON is not configured')

    let client: Rcon | undefined
    try {
      client = await Rcon.connect({
        host: this.settings.host,
        port: this.settings.port,
        password: this.settings.password,
        timeout: 5000,
      })
      this.state.connected = true
      this.state.lastConnectedAt = new Date().toISOString()
      this.state.lastError = undefined
      return await client.send(command)
    } catch (error) {
      this.state.connected = false
      this.state.lastError = error instanceof Error ? error.message : 'Unknown RCON error'
      throw error
    } finally {
      await client?.end().catch(() => undefined)
    }
  }

  async pollPlayers(): Promise<string[] | null> {
    try {
      const response = await this.send('players')
      this.state.lastPollAt = new Date().toISOString()
      return parsePlayersResponse(response)
    } catch {
      this.state.lastPollAt = new Date().toISOString()
      return null
    }
  }
}
