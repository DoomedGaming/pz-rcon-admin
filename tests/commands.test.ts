import { describe, expect, it } from 'vitest'
import { buildDefinedCommand, buildPlayerCommand, buildPlayerTeleportToPositionCommand, isModeratorPlayerAction, validateDefinedCommandOutput, validatePlayerActionOutput, validateRawCommand } from '../src/server/commands.js'

describe('command builders', () => {
  it('quotes announcement text and removes newline injection', () => {
    const result = buildDefinedCommand('announce', { message: 'Restart soon\nsave' })
    expect(result.command).toBe('servermsg "Restart soon save"')
  })

  it('gives zombie removal the coordinate arguments required by Build 42 RCON', () => {
    expect(buildDefinedCommand('remove-zombies', { radius: 100, x: 10_632, y: 9_761, z: 0 }).command)
      .toBe('removezombies -radius 100 -x 10632 -y 9761 -z 0 -reanimated false')
    expect(() => buildDefinedCommand('remove-zombies')).toThrow('Radius must be a whole number')
    expect(() => buildDefinedCommand('remove-zombies', { radius: 101, x: 10_632, y: 9_761, z: 0 })).toThrow('Radius must be a whole number')
    expect(() => buildDefinedCommand('remove-zombies', { radius: 100, x: 'west', y: 9_761, z: 0 })).toThrow('X coordinate must be a whole number')
  })

  it('validates horde counts instead of allowing silent server clamping', () => {
    expect(buildDefinedCommand('create-horde', { count: 25, username: 'Alice' }).command)
      .toBe('createhorde 25 "Alice"')
    expect(buildPlayerCommand('Alice', 'horde', { count: 500 })).toBe('createhorde 500 "Alice"')
    expect(() => buildDefinedCommand('create-horde', { count: 501, username: 'Alice' })).toThrow('Count must be a whole number')
    expect(() => buildPlayerCommand('Alice', 'horde', { count: 0 })).toThrow('Count must be a whole number')
  })

  it('validates item and vehicle identifiers and item counts', () => {
    expect(buildPlayerCommand('Alice', 'additem', { item: 'Base.Axe', count: 2 }))
      .toBe('additem "Alice" "Base.Axe" 2')
    expect(buildPlayerCommand('Alice', 'vehicle', { script: 'Base.PickUpVanLights' }))
      .toBe('addvehicle "Base.PickUpVanLights" "Alice"')
    expect(() => buildPlayerCommand('Alice', 'additem', { item: '', count: 1 })).toThrow('Item is required')
    expect(() => buildPlayerCommand('Alice', 'additem', { item: 'Base.Axe', count: 101 })).toThrow('Count must be a whole number')
    expect(() => buildPlayerCommand('Alice', 'vehicle', { script: '../Pickup' })).toThrow('not a valid Project Zomboid identifier')
  })

  it('uses the current Build 42 player ability commands', () => {
    expect(buildPlayerCommand('Alice', 'godmode')).toBe('godmodeplayer "Alice" -true')
    expect(buildPlayerCommand('Alice', 'godmode', { enabled: false })).toBe('godmodeplayer "Alice" -false')
    expect(buildPlayerCommand('Alice', 'invisible', { enabled: false })).toBe('invisibleplayer "Alice" -false')
    expect(buildPlayerCommand('Alice', 'noclip', { enabled: false })).toBe('noclip "Alice" -false')
    expect(buildPlayerCommand('Alice', 'addxp', { perk: 'Woodwork', amount: 100 })).toBe('addxp "Alice" Woodwork=100 -true')
  })

  it('builds guarded in-game role and secondary administration commands', () => {
    expect(buildPlayerCommand('Alice', 'access-level', { level: 'observer' })).toBe('setaccesslevel "Alice" observer')
    expect(buildPlayerCommand('Alice', 'access-level', { level: 'eventhost' })).toBe('setaccesslevel "Alice" eventhost')
    expect(buildPlayerCommand('Alice', 'access-level', { level: 'none' })).toBe('setaccesslevel "Alice" none')
    expect(buildPlayerCommand('Alice', 'voiceban', { enabled: true })).toBe('voiceban "Alice" -true')
    expect(buildPlayerCommand('Alice', 'clear-map-symbols')).toBe('removemapsymbolsforuser "Alice"')
    expect(() => buildPlayerCommand('Alice', 'access-level', { level: 'event host' })).toThrow('valid in-game role')
  })

  it('validates structured live weather commands', () => {
    expect(buildDefinedCommand('start-rain', { intensity: 50 }).command).toBe('startrain 50')
    expect(buildDefinedCommand('start-storm', { duration: 60 }).command).toBe('startstorm 60')
    expect(buildDefinedCommand('stop-weather').command).toBe('stopweather')
    expect(() => buildDefinedCommand('start-rain', { intensity: 101 })).toThrow('Rain intensity')
    expect(() => buildDefinedCommand('start-storm', { duration: 169 })).toThrow('Storm duration')
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
      .toBe('teleportplayer "Alice" "Bob"')
    expect(buildPlayerTeleportToPositionCommand('Alice', { x: 10_632.9, y: 9_761.1, z: 0 }))
      .toBe('teleportto "Alice" 10632,9761,0')
  })

  it('rejects unsafe teleport destinations', () => {
    expect(() => buildPlayerCommand('Alice', 'teleport-coordinates', { x: 'west', y: 100, z: 0 }))
      .toThrow('X coordinate must be a whole number')
    expect(() => buildPlayerCommand('Alice', 'teleport-coordinates', { x: 100, y: -1, z: 0 }))
      .toThrow('Y coordinate must be a whole number')
    expect(() => buildPlayerCommand('Alice', 'teleport-player', { destination: 'alice' }))
      .not.toThrow()
    expect(() => buildPlayerCommand('Alice', 'teleport-player', { destination: 'Alice' }))
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

  it('classifies other known Build 42 player-action errors as failures', () => {
    expect(() => validatePlayerActionOutput('teleport-player', "Can't find player Bob")).toThrow('could not find')
    expect(() => validatePlayerActionOutput('kick', "User Alice doesn't exist.")).toThrow('could not find')
    expect(() => validatePlayerActionOutput('kick', "This user can't be kicked.")).toThrow('rejected the kick')
    expect(() => validatePlayerActionOutput('additem', "Item Base.Missing doesn't exist.")).toThrow('could not find that item')
    expect(() => validatePlayerActionOutput('vehicle', 'Unknown vehicle script "Base.Missing"')).toThrow('vehicle spawn')
    expect(() => validatePlayerActionOutput('godmode', 'Wrong arguments!')).toThrow('rejected the player action')
  })

  it('classifies known Build 42 server-command errors as failures', () => {
    expect(() => validateDefinedCommandOutput('save', 'Unknown command save')).toThrow('does not expose')
    expect(() => validateDefinedCommandOutput('create-horde', 'User "Missing" not found')).toThrow('horde request')
    expect(() => validateDefinedCommandOutput('lightning', 'Pass a username')).toThrow('lightning request')
    expect(() => validateDefinedCommandOutput('remove-zombies', 'invalid z')).toThrow('zombie removal coordinates')
    expect(validateDefinedCommandOutput('save', 'World saved')).toBe('World saved')
  })

  it('rejects empty raw commands', () => {
    expect(() => validateRawCommand('  ')).toThrow('Command is required')
  })

  it('preserves raw-command quoting and rejects oversized commands instead of truncating them', () => {
    expect(validateRawCommand('servermsg "Restart soon"')).toBe('servermsg "Restart soon"')
    expect(validateRawCommand('servermsg "First"\nsave')).toBe('servermsg "First" save')
    expect(() => validateRawCommand(`servermsg ${'x'.repeat(501)}`)).toThrow('Command is too long')
  })
})
