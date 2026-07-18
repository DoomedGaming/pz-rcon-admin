import { describe, expect, it } from 'vitest'
import { parsePlayersResponse } from '../src/server/rcon.js'

describe('parsePlayersResponse', () => {
  it('parses the standard Project Zomboid response', () => {
    expect(parsePlayersResponse('Players connected (2):\n-Alice\n-Bob')).toEqual(['Alice', 'Bob'])
  })

  it('accepts numbered and username-prefixed variants', () => {
    expect(parsePlayersResponse('Players:\n1. Alice\nusername=Bob\nAlice')).toEqual(['Alice', 'Bob'])
  })

  it('returns an empty list when nobody is connected', () => {
    expect(parsePlayersResponse('Players connected (0):\nNo players connected')).toEqual([])
  })
})
