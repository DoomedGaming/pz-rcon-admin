import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('telemetry companion boundary', () => {
  it('declares an exact lockstep telemetry release', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    const release = JSON.parse(readFileSync(resolve('release.json'), 'utf8'))

    expect(release.version).toBe(packageJson.version)
    expect(release.telemetry.version).toBe(packageJson.version)
    expect(release.telemetry.repository).toBe('https://github.com/DoomedGaming/pz-rcon-admin-telemetry')
  })

  it('documents telemetry as a separate companion repository', () => {
    const readme = readFileSync(resolve('README.md'), 'utf8')

    expect(readme).toContain('https://github.com/DoomedGaming/pz-rcon-admin-telemetry')
    expect(readme).toContain('direct-install')
    expect(readme).toContain('PZRconAdminTelemetry')
    expect(readme).not.toContain('../server-telemetry')
  })
})
