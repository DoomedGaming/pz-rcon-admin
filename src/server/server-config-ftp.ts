import type { Writable } from 'node:stream'
import { Client, type AccessOptions } from 'basic-ftp'
import { parseIni, parseSandboxLua } from './ini.js'
import { LimitedTextSink } from './limited-text-sink.js'

const MAX_CONFIG_BYTES = 1024 * 1024

export interface ServerConfigFtpConfig {
  host: string
  port: number
  user: string
  password: string
  secure: AccessOptions['secure']
  configPath?: string
  sandboxPath?: string
  pollSeconds: number
}

export interface ServerConfigFtpUpdate {
  configValues?: Record<string, string>
  sandboxText?: string
}

export interface ServerConfigFtpState {
  configured: boolean
  connected: boolean
  configLoaded: boolean
  sandboxLoaded: boolean
  configPath?: string
  sandboxPath?: string
  lastCheckedAt?: string
  lastSyncAt?: string
  lastError?: string
}

interface FtpClient {
  ftp: { verbose: boolean }
  access(options: AccessOptions): Promise<unknown>
  downloadTo(destination: Writable, remotePath: string): Promise<unknown>
  close(): void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'FTP download failed'
}

export class ServerConfigFtpBridge {
  private inFlight = false
  private configSnapshot = ''
  private sandboxSnapshot = ''
  private readonly configured: boolean
  private readonly state: ServerConfigFtpState

  constructor(
    private readonly config: ServerConfigFtpConfig,
    private readonly importUpdate: (update: ServerConfigFtpUpdate) => Promise<void> | void,
    private readonly clientFactory: () => FtpClient = () => new Client(),
  ) {
    this.configured = Boolean(
      config.host
      && config.user
      && config.password
      && (config.configPath || config.sandboxPath),
    )
    this.state = {
      configured: this.configured,
      connected: false,
      configLoaded: false,
      sandboxLoaded: false,
      configPath: config.configPath || undefined,
      sandboxPath: config.sandboxPath || undefined,
    }
  }

  getState(): ServerConfigFtpState {
    return { ...this.state }
  }

  private async download(client: FtpClient, remotePath: string): Promise<string> {
    const sink = new LimitedTextSink(MAX_CONFIG_BYTES, 'Server configuration file exceeds 1 MiB')
    await client.downloadTo(sink, remotePath)
    return sink.text()
  }

  async poll(): Promise<boolean> {
    if (!this.configured || this.inFlight) return false
    this.inFlight = true
    const client = this.clientFactory()
    this.state.lastCheckedAt = new Date().toISOString()

    try {
      client.ftp.verbose = false
      await client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        secure: this.config.secure,
      })

      const update: ServerConfigFtpUpdate = {}
      const errors: string[] = []
      let downloaded = 0
      let nextConfigSnapshot: string | undefined
      let nextSandboxSnapshot: string | undefined

      if (this.config.configPath) {
        try {
          const text = await this.download(client, this.config.configPath)
          const values = parseIni(text)
          if (!Object.keys(values).length) throw new Error('file did not contain readable settings')
          this.state.configLoaded = true
          downloaded += 1
          if (text !== this.configSnapshot) {
            nextConfigSnapshot = text
            update.configValues = values
          }
        } catch (error) {
          errors.push(`servertest.ini: ${errorMessage(error)}`)
        }
      }

      if (this.config.sandboxPath) {
        try {
          const text = await this.download(client, this.config.sandboxPath)
          if (!Object.keys(parseSandboxLua(text)).length) throw new Error('file did not contain readable settings')
          this.state.sandboxLoaded = true
          downloaded += 1
          if (text !== this.sandboxSnapshot) {
            nextSandboxSnapshot = text
            update.sandboxText = text
          }
        } catch (error) {
          errors.push(`SandboxVars.lua: ${errorMessage(error)}`)
        }
      }

      if (Object.keys(update).length) {
        // Commit snapshots only after a successful import so a failed import
        // is retried on the next poll instead of being skipped as unchanged.
        await this.importUpdate(update)
        if (nextConfigSnapshot !== undefined) this.configSnapshot = nextConfigSnapshot
        if (nextSandboxSnapshot !== undefined) this.sandboxSnapshot = nextSandboxSnapshot
        this.state.lastSyncAt = new Date().toISOString()
      }
      this.state.connected = downloaded > 0
      this.state.lastError = errors.length ? errors.join('; ') : undefined
      return downloaded > 0 && errors.length === 0
    } catch (error) {
      this.state.connected = false
      this.state.lastError = errorMessage(error)
      return false
    } finally {
      client.close()
      this.inFlight = false
    }
  }
}
