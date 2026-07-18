import type { PlayerSettings, PlayerTheme } from './types.js'

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = { theme: 'green' }
export const PLAYER_THEMES: PlayerTheme[] = ['green', 'amber', 'blue', 'violet', 'rose']

export function isPlayerTheme(value: unknown): value is PlayerTheme {
  return typeof value === 'string' && PLAYER_THEMES.includes(value as PlayerTheme)
}
