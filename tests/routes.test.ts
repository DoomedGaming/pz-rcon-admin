import { describe, expect, it } from 'vitest'
import { isAdminConsolePath } from '../src/shared/routes.js'

describe('admin console route selection', () => {
  it('selects the admin console for the admin route and its descendants', () => {
    expect(isAdminConsolePath('/admin')).toBe(true)
    expect(isAdminConsolePath('/admin/')).toBe(true)
    expect(isAdminConsolePath('/admin/players')).toBe(true)
  })

  it('keeps the player portal as the default for all other routes', () => {
    expect(isAdminConsolePath('/')).toBe(false)
    expect(isAdminConsolePath('/player')).toBe(false)
    expect(isAdminConsolePath('/player/profile')).toBe(false)
    expect(isAdminConsolePath('/administrator')).toBe(false)
    expect(isAdminConsolePath('/unrelated')).toBe(false)
  })
})
