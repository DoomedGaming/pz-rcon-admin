import type { Readable, Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { normalizeSandboxValue, SandboxControlBridge, sandboxSettingsFromValues } from '../src/server/sandbox-control.js'

async function readStream(source: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of source) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function write(destination: Writable, text: string) {
  await new Promise<void>((resolve, reject) => destination.end(text, (error?: Error | null) => error ? reject(error) : resolve()))
}

describe('live SandboxVars control bridge', () => {
  it('turns flattened SandboxVars values into typed searchable controls', () => {
    const settings = sandboxSettingsFromValues({
      'SandboxVars.Zombies': 4,
      'SandboxVars.ZombieLore.Speed': 2,
      'SandboxVars.MultiHitZombies': false,
      unrelated: true,
    })
    expect(settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ option: 'Zombies', category: 'General', kind: 'number', value: 4 }),
      expect.objectContaining({ option: 'ZombieLore.Speed', category: 'ZombieLore', kind: 'number', value: 2 }),
      expect.objectContaining({ option: 'MultiHitZombies', kind: 'boolean', value: false }),
    ]))
    expect(settings).toHaveLength(3)
  })

  it('normalizes values according to the loaded SandboxVars type', () => {
    const [setting] = sandboxSettingsFromValues({ 'SandboxVars.MultiHitZombies': false })
    expect(normalizeSandboxValue(setting, true)).toBe('true')
    expect(() => normalizeSandboxValue(setting, 'sometimes')).toThrow('enabled or disabled')
  })

  it('uploads one request and waits for the matching server acknowledgement', async () => {
    let requestId = ''
    const uploadFrom = vi.fn(async (source: Readable, remotePath: string) => {
      expect(remotePath).toBe('Lua/PZRconAdminTelemetry/control.txt')
      const request = await readStream(source)
      requestId = request.match(/^requestId=(.+)$/m)?.[1] ?? ''
      expect(request).toContain('option=ZombieLore.Speed')
      expect(request).toContain('valueHex=32')
    })
    const client = {
      ftp: { verbose: true },
      access: vi.fn().mockResolvedValue(undefined),
      uploadFrom,
      downloadTo: vi.fn(async (destination: Writable, remotePath: string) => {
        expect(remotePath).toBe('Lua/PZRconAdminTelemetry/control-status.txt')
        await write(destination, [
          'version=1',
          `requestId=${requestId}`,
          'state=applied',
          'option=ZombieLore.Speed',
          'valueHex=32',
          `messageHex=${Buffer.from('Sandbox option applied and saved').toString('hex')}`,
          'appliedAt=1784135200',
        ].join('\n'))
      }),
      close: vi.fn(),
    }
    const bridge = new SandboxControlBridge({
      host: 'ftp.example.test',
      port: 21,
      user: 'operator',
      password: 'secret',
      secure: false,
      telemetryPath: 'Lua/PZRconAdminTelemetry/players.txt',
      timeoutMs: 100,
      pollMs: 0,
    }, () => client)

    await expect(bridge.apply('ZombieLore.Speed', '2')).resolves.toMatchObject({ value: '2', appliedAt: 1_784_135_200 })
    expect(uploadFrom).toHaveBeenCalledOnce()
    expect(client.close).toHaveBeenCalledOnce()
  })

  it('returns a matching rejection from the server companion immediately', async () => {
    let requestId = ''
    const client = {
      ftp: { verbose: true },
      access: vi.fn().mockResolvedValue(undefined),
      uploadFrom: vi.fn(async (source: Readable) => {
        requestId = (await readStream(source)).match(/^requestId=(.+)$/m)?.[1] ?? ''
      }),
      downloadTo: vi.fn(async (destination: Writable) => write(destination, [
        `requestId=${requestId}`,
        'state=failed',
        `messageHex=${Buffer.from('Server rejected this value').toString('hex')}`,
      ].join('\n'))),
      close: vi.fn(),
    }
    const bridge = new SandboxControlBridge({
      host: 'ftp.example.test', port: 21, user: 'operator', password: 'secret', secure: false,
      telemetryPath: 'Lua/PZRconAdminTelemetry/players.txt', timeoutMs: 100, pollMs: 0,
    }, () => client)

    await expect(bridge.apply('ZombieLore.Speed', '99')).rejects.toThrow('Server rejected this value')
    expect(client.close).toHaveBeenCalledOnce()
  })
})
