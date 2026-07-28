import { describe, expect, it } from 'vitest'
import { buildDefinedCommand, buildPlayerCommand, buildPlayerTeleportToPositionCommand, isModeratorPlayerAction, validatePlayerActionOutput, validateRawCommand } from '../src/server/commands.js'

describe('command builders', () => {
  it('quotes announcement text and removes newline injection', () => {
    const result = buildDefinedCommand('announce', { message: 'Restart soon\nsave' })
    expect(result.command).toBe('servermsg "Restart soon save"')
  })

  it('uses the current Build 42 player ability commands', () => {
    expect(buildPlayerCommand('Alice', 'godmode')).toBe('godmodeplayer "Alice" -true')
    expect(buildPlayerCommand('Alice', 'godmode', { enabled: false })).toBe('godmodeplayer "Alice" -false')
    expect(buildPlayerCommand('Alice', 'addxp', { perk: 'Woodwork', amount: 100 })).toBe('addxp "Alice" Woodwork=100 -true')
  })

  it('requires a reason for every moderator player action', () => {
    expect(isModeratorPlayerAction('kick')).toBe(true)
    expect(isModeratorPlayerAction('ban')).toBe(true)
    expect(isModeratorPlayerAction('remove-whitelist')).toBe(true)
    expect(isModeratorPlayerAction('godmode')).toBe(false)
    expect(buildPlayerCommand('Alice', 'kick', { reason: 'Repeated griefing' }))
      .toBe('kickuser "Alice" -r "Repeated griefing"')
    expect(buildPlayerCommand('Alice', 'ban', { reason: 'Threats\nand harassment' }))
      .toBe('banuser "Alice" -r "Threats and harassment"')
    expect(buildPlayerCommand('Alice', 'remove-whitelist', { reason: 'Access revoked' }))
      .toBe('removeuserfromwhitelist "Alice"')
    expect(() => buildPlayerCommand('Alice', 'kick', { reason: '  ' })).toThrow('moderation reason is required')
    expect(() => buildPlayerCommand('Alice', 'ban')).toThrow('moderation reason is required')
    expect(() => buildPlayerCommand('Alice', 'remove-whitelist')).toThrow('moderation reason is required')
  })

  it('builds coordinate and player teleport commands', () => {
    expect(buildPlayerCommand('Alice', 'teleport-coordinates', { x: 10_632, y: 9_761, z: 0 }))
      .toBe('teleportto "Alice" 10632,9761,0')
    expect(buildPlayerCommand('Alice', 'teleport-player', { destination: 'Bob' }))
      .toBe('teleport "Alice" "Bob"')
    expect(buildPlayerTeleportToPositionCommand('Alice', { x: 10_632.9, y: 9_761.1, z: 0 }))
      .toBe('teleportto "Alice" 10632,9761,0')
  })

  it('rejects unsafe teleport destinations', () => {
    expect(() => buildPlayerCommand('Alice', 'teleport-coordinates', { x: 'west', y: 100, z: 0 }))
      .toThrow('X coordinate must be a whole number')
    expect(() => buildPlayerCommand('Alice', 'teleport-coordinates', { x: 100, y: -1, z: 0 }))
      .toThrow('Y coordinate must be a whole number')
    expect(() => buildPlayerCommand('Alice', 'teleport-player', { destination: 'alice' }))
      .toThrow('Choose a different destination survivor')
  })

  it('maps the Electrical skill label to Project Zomboid\'s Electricity perk ID', () => {
    expect(buildPlayerCommand('Alice', 'addxp', { perk: 'Electrical', amount: 100 })).toBe('addxp "Alice" Electricity=100 -true')
    expect(buildPlayerCommand('Alice', 'addxp', { perk: 'electrical', amount: 100 })).toBe('addxp "Alice" Electricity=100 -true')
  })

  it('rejects unknown XP skills and non-numeric XP amounts', () => {
    expect(() => buildPlayerCommand('Alice', 'addxp', { perk: 'UnknownSkill', amount: 100 })).toThrow()
    expect(() => buildPlayerCommand('Alice', 'addxp', { perk: 'Electricity', amount: 'lots' })).toThrow()
  })

  it('accepts only numeric per-vehicle key IDs', () => {
    expect(buildPlayerCommand('Alice', 'key', { keyId: 42_918, name: 'Pickup key' }))
      .toBe('addkey "Alice" "42918" "Pickup key"')
    expect(() => buildPlayerCommand('Alice', 'key', { keyId: 'Base.CarKey' }))
      .toThrow('Vehicle key ID must be a whole number')
  })

  it('classifies known Project Zomboid XP rejection replies as failures', () => {
    expect(() => validatePlayerActionOutput('addxp', 'List of available perks :\nFitness\nElectricity')).toThrow()
    expect(() => validatePlayerActionOutput('addxp', 'No such user')).toThrow()
    expect(validatePlayerActionOutput('addxp', "Added 100 Electricity xp's to Alice")).toBe("Added 100 Electricity xp's to Alice")
  })

  it('classifies unavailable server commands as failures', () => {
    expect(() => validatePlayerActionOutput('teleport-coordinates', 'Unknown command teleportto'))
      .toThrow('server build does not expose that RCON command')
  })

  it('reports rejected teleport replies instead of treating them as successful', () => {
    expect(() => validatePlayerActionOutput('teleport-player', 'Error: Unable to teleport player')).toThrow('rejected the teleport')
    expect(() => validatePlayerActionOutput('teleport-player', 'Usage: /teleport "player"')).toThrow('rejected the teleport')
  })

  it('rejects empty raw commands', () => {
    expect(() => validateRawCommand('  ')).toThrow('Command is required')
  })
})
