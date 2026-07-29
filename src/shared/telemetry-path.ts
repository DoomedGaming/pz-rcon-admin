export const DEFAULT_TELEMETRY_REMOTE_PATH = 'Lua/PZRconAdminTelemetry/players.txt'
export const LEGACY_TELEMETRY_REMOTE_PATH = 'Lua/PZRconAdminTelemetry/players.json'

export function normalizeTelemetryRemotePath(value: unknown): string {
  const path = String(value ?? '').trim()
  if (!path || path === LEGACY_TELEMETRY_REMOTE_PATH) return DEFAULT_TELEMETRY_REMOTE_PATH
  return path
}
