import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SETTINGS, isPlayerTheme, PLAYER_THEMES } from '../src/shared/player-settings.js'

describe('player settings', () => {
  it('keeps green as the default and exposes only supported themes', () => {
    expect(DEFAULT_PLAYER_SETTINGS).toEqual({ theme: 'green' })
    expect(PLAYER_THEMES).toEqual(['green', 'amber', 'blue', 'violet', 'rose'])
  })

  it('rejects arbitrary theme values', () => {
    expect(isPlayerTheme('blue')).toBe(true)
    expect(isPlayerTheme('custom-css')).toBe(false)
    expect(isPlayerTheme({ theme: 'green' })).toBe(false)
  })
})
