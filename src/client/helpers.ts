import type { SetupStatus } from '@shared/types'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(body.error || `Request failed (${response.status})`, response.status)
  return body as T
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (!hours) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export function relativeTime(value?: string, missing = 'Never'): string {
  if (!value) return missing
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000))
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

// Polls the setup endpoint until the dashboard comes back after a
// configuration-triggered restart. The dashboard is expected to be briefly
// unreachable while its supervisor restarts it.
export async function waitForDashboardRestart(cancelled: () => boolean = () => false): Promise<'restarted' | 'timeout' | 'cancelled'> {
  await delay(1_500)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (cancelled()) return 'cancelled'
    try {
      const response = await fetch('/api/setup/status', { cache: 'no-store' })
      const status = await response.json() as SetupStatus
      if (response.ok && status.configured && !status.restartRequired) return 'restarted'
    } catch {
      // Expected while the service is down.
    }
    await delay(1_500)
  }
  return 'timeout'
}
