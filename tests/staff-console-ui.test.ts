import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

describe('staff console browser boundaries', () => {
  it('links routine staff access to /mod and returns signed-out staff to the portal', () => {
    const app = read('src/client/App.vue')
    const portal = read('src/client/PlayerPortal.vue')
    const configuration = read('src/client/ConfigurationEditor.vue')

    expect(portal).toContain(':href="STAFF_CONSOLE_PATH"')
    expect(portal).not.toContain('href="/admin"')
    expect(app).toContain('if (!session.authenticated && !bootstrapAdminMode)')
    expect(app.match(/window\.location\.replace\(PLAYER_PORTAL_PATH\)/g)).toHaveLength(2)
    expect(configuration).toContain('window.location.assign(STAFF_CONSOLE_PATH)')
  })

  it('keeps every moderation button disabled until its survivor has a reason', () => {
    const app = read('src/client/App.vue')

    expect(app).toContain('Reason required and recorded in the audit log')
    expect(app.match(/!playerReasons\[playerItem\.username\]\?\.trim\(\)/g)).toHaveLength(3)
    expect(app).toContain("playerAction(playerItem.username, 'remove-whitelist', { reason: playerReasons[playerItem.username] })")
  })

  it('opens Discord request links in a focused staff dialog', () => {
    const app = read('src/client/App.vue')

    expect(app).toContain("new URLSearchParams(window.location.search).get('request')")
    expect(app).toContain("page.value = 'requests'")
    expect(app).toContain("requestFilter.value = 'all'")
    expect(app).toContain(':role="requestDialogOpen ? \'dialog\' : undefined"')
    expect(app).toContain('aria-label="Close request dialog"')
    expect(app).toContain("event.key === 'Escape'")
  })

  it('shows the authoritative Project Zomboid build reported by telemetry', () => {
    const app = read('src/client/App.vue')

    expect(app).toContain('Project Zomboid build')
    expect(app).toContain('const serverVersionLabel = computed')
    expect(app).toContain("integration.telemetryConnected ? 'Not reported by companion' : 'Waiting for telemetry'")
    expect(app).toContain(':server-version="overview.server.serverVersion"')
  })

  it('offers exact-confirmation removal only for offline dashboard records', () => {
    const app = read('src/client/App.vue')
    const server = read('src/server/index.ts')

    expect(app).toContain('Remove from dashboard')
    expect(app).toContain('playerItem.online || busy === `remove-dashboard-${playerItem.username}`')
    expect(app).toContain("method: 'DELETE'")
    expect(app).toContain('confirmation !== player.username')
    expect(server).toContain("app.delete('/api/admin/players/:username', requireDashboardRole('admin')")
    expect(server).toContain('request.body?.confirm !== username')
  })
})
