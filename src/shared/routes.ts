export const PLAYER_PORTAL_PATH = '/'
export const STAFF_CONSOLE_PATH = '/mod'
export const BOOTSTRAP_ADMIN_PATH = '/admin'

export function normalizePublicAdminUrl(publicBaseUrl: string | undefined): string | undefined {
  const candidate = publicBaseUrl?.trim()
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

export function buildStaffRequestUrl(publicBaseUrl: string | undefined, requestId: string): string | undefined {
  const normalizedBaseUrl = normalizePublicAdminUrl(publicBaseUrl)
  const id = requestId.trim()
  if (!normalizedBaseUrl || !id || id.length > 128) return undefined
  try {
    const url = new URL(normalizedBaseUrl)
    url.pathname = STAFF_CONSOLE_PATH
    url.searchParams.set('request', id)
    return url.toString()
  } catch {
    return undefined
  }
}

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function isStaffConsolePath(pathname: string): boolean {
  return matchesRoute(pathname, STAFF_CONSOLE_PATH) || matchesRoute(pathname, BOOTSTRAP_ADMIN_PATH)
}

export function isBootstrapAdminPath(pathname: string): boolean {
  return matchesRoute(pathname, BOOTSTRAP_ADMIN_PATH)
}
