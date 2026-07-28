export const PLAYER_PORTAL_PATH = '/'
export const STAFF_CONSOLE_PATH = '/mod'
export const BOOTSTRAP_ADMIN_PATH = '/admin'

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function isStaffConsolePath(pathname: string): boolean {
  return matchesRoute(pathname, STAFF_CONSOLE_PATH) || matchesRoute(pathname, BOOTSTRAP_ADMIN_PATH)
}

export function isBootstrapAdminPath(pathname: string): boolean {
  return matchesRoute(pathname, BOOTSTRAP_ADMIN_PATH)
}
