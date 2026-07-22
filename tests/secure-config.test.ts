import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applySecureConfig, buildInitialSecureConfig, loadSecureConfig, saveSecureConfig } from '../src/server/secure-config.js'

describe('encrypted secure configuration', () => {
  it('encrypts values at rest and restricts directory and file permissions', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pz-rcon-secure-'))
    const secret = 'a-secret-that-must-not-appear-in-the-file'
    saveSecureConfig({ DASHBOARD_PASSWORD: secret, PZ_RCON_PORT: '27015', UNKNOWN: 'ignored' }, directory)

    expect(loadSecureConfig(directory)).toEqual({ DASHBOARD_PASSWORD: secret, PZ_RCON_PORT: '27015' })
    expect(readFileSync(join(directory, 'config.enc.json'), 'utf8')).not.toContain(secret)
    expect(statSync(directory).mode & 0o777).toBe(0o700)
    expect(statSync(join(directory, 'master.key')).mode & 0o777).toBe(0o600)
    expect(statSync(join(directory, 'config.enc.json')).mode & 0o777).toBe(0o600)
  })

  it('fills missing process values without overriding explicit deployment settings', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pz-rcon-secure-'))
    saveSecureConfig({ DASHBOARD_PASSWORD: 'stored-password', PZ_RCON_PORT: '27015' }, directory)
    const environment = { PZ_SECURE_CONFIG_DIR: directory, DASHBOARD_PASSWORD: 'environment-password' } as NodeJS.ProcessEnv

    const state = applySecureConfig(environment)

    expect(state.configured).toBe(true)
    expect(environment.DASHBOARD_PASSWORD).toBe('environment-password')
    expect(environment.PZ_RCON_PORT).toBe('27015')
  })

  it('fails closed when ciphertext is modified', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pz-rcon-secure-'))
    saveSecureConfig({ DASHBOARD_PASSWORD: 'stored-password' }, directory)
    const path = join(directory, 'config.enc.json')
    const payload = JSON.parse(readFileSync(path, 'utf8'))
    payload.ciphertext = `${payload.ciphertext.slice(0, -2)}AA`
    writeFileSync(path, JSON.stringify(payload), { mode: 0o600 })

    expect(() => loadSecureConfig(directory)).toThrow()
  })

  it('accepts browser number fields and generates independent session secrets', () => {
    const config = buildInitialSecureConfig({
      DASHBOARD_PASSWORD: 'a-long-dashboard-password',
      DASHBOARD_SESSION_SECRET: '',
      PZ_RCON_HOST: '127.0.0.1',
      PZ_RCON_PORT: 27015,
      PZ_RCON_PASSWORD: 'a-rcon-password',
      PZ_PLAYER_AUTH_ENABLED: true,
      PZ_PLAYER_SESSION_SECRET: '',
    })

    expect(config.PZ_RCON_PORT).toBe('27015')
    expect(config.PZ_PLAYER_AUTH_ENABLED).toBe('true')
    expect(config.DASHBOARD_SESSION_SECRET).toHaveLength(43)
    expect(config.PZ_PLAYER_SESSION_SECRET).toHaveLength(43)
    expect(config.PZ_PLAYER_SESSION_SECRET).not.toBe(config.DASHBOARD_SESSION_SECRET)
  })

  it('adds default remote server configuration paths when FTP is configured', () => {
    const config = buildInitialSecureConfig({
      DASHBOARD_PASSWORD: 'a-long-dashboard-password',
      PZ_RCON_HOST: '127.0.0.1',
      PZ_RCON_PORT: 27015,
      PZ_RCON_PASSWORD: 'a-rcon-password',
      PZ_TELEMETRY_FTP_HOST: 'ftp.example.test',
      PZ_TELEMETRY_FTP_USER: 'operator',
      PZ_TELEMETRY_FTP_PASSWORD: 'secret',
    })

    expect(config.PZ_CONFIG_FTP_PATH).toBe('Server/servertest.ini')
    expect(config.PZ_SANDBOX_FTP_PATH).toBe('Server/servertest_SandboxVars.lua')
    expect(config.PZ_TELEMETRY_FTP_POLL_SECONDS).toBe('5')
  })
})
