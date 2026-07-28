import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

describe('administrator audit boundary', () => {
  it('keeps the audit navigation and view behind the administrator role', () => {
    const client = read('src/client/App.vue')

    expect(client).toContain("{ id: 'audit', label: 'Audit log', icon: 'list', adminOnly: true }")
    expect(client).toContain("page === 'audit' && isAdmin")
    expect(client).toMatch(/!isAdmin\.value[\s\S]+Promise\.resolve\(\[\]\)[\s\S]+api<AuditEntry\[]>\('\/api\/audit\?limit=200'\)/)
  })

  it('requires administrator access for full and recent audit data', () => {
    const server = read('src/server/index.ts')

    expect(server).toContain("recentAudit: requestDashboardIdentity(request).role === 'admin' ? store.getAudit(8) : []")
    expect(server).toContain("app.get('/api/audit', requireDashboardRole('admin')")
  })
})
