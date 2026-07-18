import type { Request, Response } from 'express'
import { describe, expect, it } from 'vitest'
import { createAuth, createPlayerAuth } from '../src/server/auth.js'

function responseMock(): Response {
  const headers = new Map<string, string | string[]>()
  return {
    getHeader(name: string) { return headers.get(name) },
    setHeader(name: string, value: string | string[]) { headers.set(name, value); return this },
  } as unknown as Response
}

function cookieHeader(response: Response): string {
  const values = response.getHeader('Set-Cookie')
  return (Array.isArray(values) ? values[0] : String(values)).split(';')[0]
}

describe('dashboard session authentication', () => {
  it('accepts only the configured bootstrap password and rejects a tampered cookie', () => {
    const auth = createAuth('correct horse', 'a-unique-session-secret-at-least-32', false)
    const rejected = responseMock()
    expect(auth.login('wrong', rejected)).toBe(false)
    expect(rejected.getHeader('Set-Cookie')).toBeUndefined()

    const accepted = responseMock()
    expect(auth.login('correct horse', accepted)).toBe(true)
    const cookie = cookieHeader(accepted)
    expect(cookie).toContain('pz_admin_session=')
    expect(auth.authenticated({ headers: { cookie } } as Request)).toBe(true)
    expect(auth.authenticated({ headers: { cookie: `${cookie}x` } } as Request)).toBe(false)
  })

  it('binds player sessions to their signed username and clears both session types on logout', () => {
    const playerAuth = createPlayerAuth('a-different-player-secret-at-least-32', false)
    const loginResponse = responseMock()
    playerAuth.login('MuldraughMedic', loginResponse)
    const cookie = cookieHeader(loginResponse)

    expect(playerAuth.username({ headers: { cookie } } as Request)).toBe('MuldraughMedic')
    expect(playerAuth.username({ headers: { cookie: cookie.replace(/.$/, 'x') } } as Request)).toBeUndefined()

    const logoutResponse = responseMock()
    createAuth('bootstrap', 'bootstrap-session-secret-at-least-32', false).logout(logoutResponse)
    playerAuth.logout(logoutResponse)
    expect(logoutResponse.getHeader('Set-Cookie')).toEqual([
      expect.stringContaining('pz_admin_session=;'),
      expect.stringContaining('pz_player_session=;'),
    ])
  })
})
