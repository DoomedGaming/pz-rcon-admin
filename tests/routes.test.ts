import { describe, expect, it } from 'vitest'
import { BOOTSTRAP_ADMIN_PATH, isBootstrapAdminPath, isStaffConsolePath, STAFF_CONSOLE_PATH } from '../src/shared/routes.js'

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
})
