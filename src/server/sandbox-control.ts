import { randomUUID } from 'node:crypto'
import { Readable, type Writable } from 'node:stream'
import { Client, type AccessOptions } from 'basic-ftp'
import { LimitedTextSink } from './limited-text-sink.js'
import type { SandboxSettingState } from '../shared/types.js'

const MAX_STATUS_BYTES = 64 * 1024
const MAX_VALUE_BYTES = 4096

export interface SandboxControlConfig {
  host: string
  port: number
  user: string
  password: string
  secure: AccessOptions['secure']
  telemetryPath: string
  timeoutMs?: number
  pollMs?: number
}

interface FtpClient {
  ftp: { verbose: boolean }
  access(options: AccessOptions): Promise<unknown>
  uploadFrom(source: Readable, remotePath: string): Promise<unknown>
  downloadTo(destination: Writable, remotePath: string): Promise<unknown>
  close(): void
}

function companionPath(telemetryPath: string, file: string): string {
  const normalized = telemetryPath.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  const slash = normalized.lastIndexOf('/')
  return `${slash >= 0 ? normalized.slice(0, slash + 1) : ''}${file}`
}

function parseKeyValue(text: string): Record<string, string> {
  const output: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*)=(.*)$/)
    if (match) output[match[1]] = match[2]
  }
  return output
}

function decodeHex(value: string | undefined): string {
  if (!value || value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) return ''
  return Buffer.from(value, 'hex').toString('utf8')
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function sandboxSettingsFromValues(values: Record<string, string | number | boolean>): SandboxSettingState[] {
  return Object.entries(values)
    .filter(([key, value]) => key.startsWith('SandboxVars.') && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => {
      const option = key.slice('SandboxVars.'.length)
      const segments = option.split('.')
      return {
        key,
        option,
        category: segments.length > 1 ? segments[0] : 'General',
        label: segments.at(-1)!.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
        kind: typeof value === 'boolean' ? 'boolean' as const : typeof value === 'number' ? 'number' as const : 'string' as const,
        value,
      }
    })
    .sort((left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label))
}

export function normalizeSandboxValue(setting: SandboxSettingState, input: unknown): string {
  if (setting.kind === 'boolean') {
    if (input === true || String(input).toLowerCase() === 'true') return 'true'
    if (input === false || String(input).toLowerCase() === 'false') return 'false'
    throw new Error(`${setting.label} must be enabled or disabled`)
  }
  if (setting.kind === 'number') {
    const number = typeof input === 'number' ? input : Number(String(input).trim())
    if (!Number.isFinite(number)) throw new Error(`${setting.label} must be a number`)
    return String(number)
  }
  const value = String(input ?? '').trim()
  if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) throw new Error(`${setting.label} is too long`)
  return value
}

export class SandboxControlBridge {
  private readonly configured: boolean
  private readonly controlPath: string
  private readonly statusPath: string

  constructor(
    private readonly config: SandboxControlConfig,
    private readonly clientFactory: () => FtpClient = () => new Client(),
  ) {
    this.configured = Boolean(config.host && config.user && config.password && config.telemetryPath)
    this.controlPath = companionPath(config.telemetryPath, 'control.txt')
    this.statusPath = companionPath(config.telemetryPath, 'control-status.txt')
  }

  isConfigured() {
    return this.configured
  }

  async apply(option: string, value: string): Promise<{ requestId: string; value: string; message: string; appliedAt?: number }> {
    if (!this.configured) throw new Error('Sandbox live control requires the telemetry FTP/FTPS connection')
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(option) || option.length > 128) throw new Error('Invalid sandbox option name')
    if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) throw new Error('Sandbox option value is too long')

    const requestId = randomUUID()
    const request = [
      'version=1',
      `requestId=${requestId}`,
      'action=setSandboxOption',
      `option=${option}`,
      `valueHex=${Buffer.from(value, 'utf8').toString('hex')}`,
    ].join('\n')
    const client = this.clientFactory()
    const timeoutMs = this.config.timeoutMs ?? 15_000
    const pollMs = this.config.pollMs ?? 500

    try {
      client.ftp.verbose = false
      await client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        secure: this.config.secure,
      })
      await client.uploadFrom(Readable.from(request), this.controlPath)

      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        await delay(pollMs)
        let statusText: string
        try {
          const sink = new LimitedTextSink(MAX_STATUS_BYTES, 'Sandbox control status exceeds 64 KiB')
          await client.downloadTo(sink, this.statusPath)
          statusText = sink.text()
        } catch {
          continue
        }
        const status = parseKeyValue(statusText)
        if (status.requestId !== requestId) continue
        const message = decodeHex(status.messageHex) || 'Sandbox control did not return a message'
        if (status.state !== 'applied') throw new Error(message)
        return {
          requestId,
          value: decodeHex(status.valueHex),
          message,
          appliedAt: status.appliedAt ? Number(status.appliedAt) : undefined,
        }
      }
      throw new Error('The server companion did not acknowledge the SandboxVars change in time')
    } finally {
      client.close()
    }
  }
}
