import { mkdtempSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DASHBOARD_PASSWORD = 'route-test-dashboard-password'

let server: Server
let baseUrl = ''

function request(path: string, options?: RequestInit) {
  return fetch(`${baseUrl}${path}`, { redirect: 'manual', ...options })
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'pz-rcon-routes-'))
  process.env.DASHBOARD_ENV_FILE = join(scratch, 'no-env-file')
  process.env.PZ_SECURE_CONFIG_DIR = join(scratch, 'secure-config')
  process.env.DATA_PATH = join(scratch, 'dashboard.json')
  process.env.DASHBOARD_PASSWORD = DASHBOARD_PASSWORD
  process.env.DASHBOARD_SESSION_SECRET = 'route-test-session-secret-0123456789'
  process.env.PZ_RCON_HOST = '127.0.0.1'
  process.env.PZ_RCON_PORT = '27015'
  process.env.PZ_RCON_PASSWORD = 'route-test-rcon-password'
  process.env.PZ_DEMO = 'true'

  // The env above must be set before the config module first loads.
  const { createDashboardServer } = await import('../src/server/app.js')
  const { app, setupRequired } = createDashboardServer({ requestRestart: () => {} })
  expect(setupRequired).toBe(false)
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise((resolve) => server?.close(resolve)))

describe('dashboard HTTP surface', () => {
  it('serves the health endpoint without authentication', async () => {
    const response = await request('/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('reports that setup is complete for an env-configured instance', async () => {
    const response = await request('/api/setup/status')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ required: false, restartRequired: false })
  })

  it('describes an unauthenticated session without leaking configuration', async () => {
    const response = await request('/api/session')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ authenticated: false, required: true, role: 'user' })
  })

  it('rejects staff endpoints and map tiles without a session', async () => {
    const overview = await request('/api/overview')
    expect(overview.status).toBe(401)
    const tile = await request('/map-tiles/b42-19/0/0_0.webp')
    expect(tile.status).toBe(401)
  })

  it('rejects player sign-in while the player portal is not configured', async () => {
    const response = await jsonRequest('/api/player/login', { username: 'somebody', password: 'irrelevant' })
    expect(response.status).toBe(503)
  })

  it('signs in with the bootstrap password and opens the staff surface', async () => {
    const login = await jsonRequest('/api/login', { password: DASHBOARD_PASSWORD })
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('pz_admin_session=')
    expect(cookie).toContain('HttpOnly')

    const sessionCookie = cookie.split(';')[0]
    const overview = await request('/api/overview', { headers: { cookie: sessionCookie } })
    expect(overview.status).toBe(200)
    const body = await overview.json()
    expect(body.connection.mode).toBe('demo')
  })

  it('locks the login endpoint after eight failures, even for the correct password', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await jsonRequest('/api/login', { password: 'wrong-password' })
      expect(response.status).toBe(401)
    }
    const lockedOut = await jsonRequest('/api/login', { password: DASHBOARD_PASSWORD })
    expect(lockedOut.status).toBe(429)
  })
})
