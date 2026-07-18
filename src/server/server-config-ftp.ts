import { Writable } from 'node:stream'
import { Client, type AccessOptions } from 'basic-ftp'
import { parseIni, parseSandboxLua } from './ini.js'

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

class LimitedTextSink extends Writable {
  private readonly chunks: Buffer[] = []
  private size = 0

  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    this.size += bytes.length
    if (this.size > MAX_CONFIG_BYTES) return callback(new Error('Server configuration file exceeds 1 MiB'))
    this.chunks.push(bytes)
    callback()
  }

  text() {
    return Buffer.concat(this.chunks).toString('utf8')
  }
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
    const sink = new LimitedTextSink()
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

      if (this.config.configPath) {
        try {
          const text = await this.download(client, this.config.configPath)
          const values = parseIni(text)
          if (!Object.keys(values).length) throw new Error('file did not contain readable settings')
          this.state.configLoaded = true
          downloaded += 1
          if (text !== this.configSnapshot) {
            this.configSnapshot = text
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
            this.sandboxSnapshot = text
            update.sandboxText = text
          }
        } catch (error) {
          errors.push(`SandboxVars.lua: ${errorMessage(error)}`)
        }
      }

      if (Object.keys(update).length) {
        await this.importUpdate(update)
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
