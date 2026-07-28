import { describe, expect, it } from 'vitest'
import { BOOTSTRAP_ADMIN_PATH, buildStaffRequestUrl, isBootstrapAdminPath, isStaffConsolePath, normalizePublicAdminUrl, STAFF_CONSOLE_PATH } from '../src/shared/routes.js'

describe('staff console route selection', () => {
  it('selects the shared console for staff and break-glass routes', () => {
    expect(STAFF_CONSOLE_PATH).toBe('/mod')
    expect(BOOTSTRAP_ADMIN_PATH).toBe('/admin')
    expect(isStaffConsolePath('/mod')).toBe(true)
    expect(isStaffConsolePath('/mod/players')).toBe(true)
    expect(isStaffConsolePath('/admin')).toBe(true)
    expect(isStaffConsolePath('/admin/players')).toBe(true)
  })

  it('identifies only the unlinked administrator route as bootstrap access', () => {
    expect(isBootstrapAdminPath('/admin')).toBe(true)
    expect(isBootstrapAdminPath('/admin/players')).toBe(true)
    expect(isBootstrapAdminPath('/mod')).toBe(false)
    expect(isBootstrapAdminPath('/mod/players')).toBe(false)
  })

  it('keeps the player portal as the default for unrelated routes', () => {
    expect(isStaffConsolePath('/')).toBe(false)
    expect(isStaffConsolePath('/player')).toBe(false)
    expect(isStaffConsolePath('/player/profile')).toBe(false)
    expect(isStaffConsolePath('/administrator')).toBe(false)
    expect(isStaffConsolePath('/unrelated')).toBe(false)
  })

  it('builds safe public links to one staff request', () => {
    expect(buildStaffRequestUrl('https://pz.example.test/base?old=true', 'request id/123'))
      .toBe('https://pz.example.test/mod?request=request+id%2F123')
    expect(buildStaffRequestUrl('javascript:alert(1)', 'request-123')).toBeUndefined()
    expect(normalizePublicAdminUrl('https://pz.example.test/base?old=true')).toBe('https://pz.example.test/')
    expect(buildStaffRequestUrl('https://user:secret@pz.example.test', 'request-123')).toBeUndefined()
  })
})
