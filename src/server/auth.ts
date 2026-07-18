import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const COOKIE_NAME = 'pz_admin_session'
const PLAYER_COOKIE_NAME = 'pz_player_session'
const SESSION_SECONDS = 12 * 60 * 60

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right))
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(header.split(';').map((part) => {
    const separator = part.indexOf('=')
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1))]
  }).filter(([key]) => key))
}

function appendCookie(response: Response, cookie: string) {
  const existing = typeof response.getHeader === 'function' ? response.getHeader('Set-Cookie') : undefined
  const cookies = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : []
  response.setHeader('Set-Cookie', [...cookies, cookie])
}

export function createAuth(password: string, secret: string, secure: boolean) {
  const required = Boolean(password)
  const signature = (expires: string) => createHmac('sha256', secret).update(expires).digest('base64url')
  const authenticated = (request: Request) => {
    if (!required) return true
    const token = parseCookies(request.headers.cookie)[COOKIE_NAME]
    if (!token) return false
    const [expires, supplied] = token.split('.')
    if (!expires || !supplied || Number(expires) < Date.now()) return false
    return safeEqual(supplied, signature(expires))
  }

  return {
    required,
    authenticated,
    login(candidate: string, response: Response): boolean {
      if (!required || !safeEqual(candidate, password)) return !required
      const expires = String(Date.now() + SESSION_SECONDS * 1000)
      const token = `${expires}.${signature(expires)}`
      appendCookie(response, `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`)
      return true
    },
    logout(response: Response) {
      appendCookie(response, `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`)
    },
    middleware(request: Request, response: Response, next: NextFunction) {
      if (authenticated(request)) return next()
      response.status(401).json({ error: 'Authentication required' })
    },
  }
}

export function createPlayerAuth(secret: string, secure: boolean) {
  const signature = (expires: string, subject: string) => createHmac('sha256', secret)
    .update(`player.${expires}.${subject}`)
    .digest('base64url')

  const username = (request: Request): string | undefined => {
    const token = parseCookies(request.headers.cookie)[PLAYER_COOKIE_NAME]
    if (!token) return undefined
    const [expires, subject, supplied] = token.split('.')
    if (!expires || !subject || !supplied || Number(expires) < Date.now()) return undefined
    if (!safeEqual(supplied, signature(expires, subject))) return undefined
    try {
      const decoded = Buffer.from(subject, 'base64url').toString('utf8')
      return decoded && Buffer.byteLength(decoded, 'utf8') <= 64 ? decoded : undefined
    } catch {
      return undefined
    }
  }

  return {
    username,
    login(canonicalUsername: string, response: Response) {
      const expires = String(Date.now() + SESSION_SECONDS * 1000)
      const subject = Buffer.from(canonicalUsername, 'utf8').toString('base64url')
      const token = `${expires}.${subject}.${signature(expires, subject)}`
      appendCookie(response, `${PLAYER_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`)
    },
    logout(response: Response) {
      appendCookie(response, `${PLAYER_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`)
    },
  }
}
