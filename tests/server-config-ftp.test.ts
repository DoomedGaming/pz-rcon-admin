import type { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { ServerConfigFtpBridge } from '../src/server/server-config-ftp.js'

const ini = [
  'PublicName=Doomed Gaming',
  'MaxPlayers=10',
  'Mods=Alpha;Beta',
  'WorkshopItems=123;456',
].join('\n')
const sandbox = 'SandboxVars = {\n  Zombies = 4,\n}'

async function write(destination: Writable, text: string) {
  await new Promise<void>((resolve, reject) => destination.end(text, (error?: Error | null) => error ? reject(error) : resolve()))
}

describe('FTP server configuration bridge', () => {
  it('downloads both files and imports changed settings on later polls', async () => {
    const imported = vi.fn()
    let currentIni = ini
    let failConfig = false
    const client = {
      ftp: { verbose: true },
      access: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      downloadTo: vi.fn(async (destination: Writable, remotePath: string) => {
        if (failConfig && remotePath.endsWith('.ini')) throw new Error('Temporary read failure')
        await write(destination, remotePath.endsWith('_SandboxVars.lua') ? sandbox : currentIni)
      }),
    }
    const bridge = new ServerConfigFtpBridge({
      host: 'ftp.example.test',
      port: 21,
      user: 'operator',
      password: 'secret',
      secure: false,
      configPath: 'Server/servertest.ini',
      sandboxPath: 'Server/servertest_SandboxVars.lua',
      pollSeconds: 60,
    }, imported, () => client)

    await expect(bridge.poll()).resolves.toBe(true)
    expect(imported).toHaveBeenCalledWith({
      configValues: expect.objectContaining({ PublicName: 'Doomed Gaming', MaxPlayers: '10' }),
      sandboxText: sandbox,
    })
    expect(bridge.getState()).toMatchObject({ connected: true, configLoaded: true, sandboxLoaded: true })

    imported.mockClear()
    currentIni = ini.replace('MaxPlayers=10', 'MaxPlayers=20')
    await expect(bridge.poll()).resolves.toBe(true)
    expect(imported).toHaveBeenCalledOnce()
    expect(imported).toHaveBeenCalledWith({ configValues: expect.objectContaining({ MaxPlayers: '20' }) })

    failConfig = true
    await expect(bridge.poll()).resolves.toBe(false)
    expect(bridge.getState()).toMatchObject({ connected: true, configLoaded: true, sandboxLoaded: true })
    expect(bridge.getState().lastError).toContain('Temporary read failure')
  })

  it('keeps a successful INI update when the sandbox download fails', async () => {
    const imported = vi.fn()
    const bridge = new ServerConfigFtpBridge({
      host: 'ftp.example.test',
      port: 21,
      user: 'operator',
      password: 'do-not-leak',
      secure: false,
      configPath: 'Server/servertest.ini',
      sandboxPath: 'Server/servertest_SandboxVars.lua',
      pollSeconds: 60,
    }, imported, () => ({
      ftp: { verbose: true },
      access: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      downloadTo: vi.fn(async (destination: Writable, remotePath: string) => {
        if (remotePath.endsWith('_SandboxVars.lua')) throw new Error('File unavailable')
        await write(destination, ini)
      }),
    }))

    await expect(bridge.poll()).resolves.toBe(false)
    expect(imported).toHaveBeenCalledWith({ configValues: expect.objectContaining({ Mods: 'Alpha;Beta' }) })
    expect(bridge.getState()).toMatchObject({ connected: true, configLoaded: true, sandboxLoaded: false })
    expect(bridge.getState().lastError).toContain('SandboxVars.lua')
    expect(JSON.stringify(bridge.getState())).not.toContain('do-not-leak')
  })
})
