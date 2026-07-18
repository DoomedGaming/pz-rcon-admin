import { describe, expect, it, vi } from 'vitest'
import { LiveSettingsService, liveSettingDefinitions, parseShowOptions, validateLiveSettingOutput } from '../src/server/live-settings.js'

describe('admin live server settings', () => {
  it('parses the running server showoptions response without accepting arbitrary text', () => {
    expect(parseShowOptions([
      'List of Server Options:',
      '* GlobalChat=true',
      '* MaxPlayers=10',
      'not an option',
    ].join('\n'))).toEqual({ GlobalChat: 'true', MaxPlayers: '10' })
  })

  it('builds only allowlisted, typed changeoption commands', () => {
    const service = new LiveSettingsService({ GlobalChat: true, MaxPlayers: 10 })

    expect(service.buildChange('GlobalChat', false)).toMatchObject({
      value: false,
      command: 'changeoption GlobalChat "false"',
    })
    expect(service.buildChange('MaxPlayers', '24')).toMatchObject({
      value: 24,
      command: 'changeoption MaxPlayers "24"',
    })
    expect(service.buildChange('MouseOverToSeeDisplayName', false).command)
      .toBe('changeoption MouseOverToSeeDisplayName "false"')
    expect(() => service.buildChange('RCONPassword', 'stolen')).toThrow('not available')
    expect(() => service.buildChange('MaxPlayers', '24\nquit')).toThrow('valid integer')
    expect(() => service.buildChange('MaxPlayers', 101)).toThrow('from 1 to 100')
  })

  it('allowlists the realtime voice, faction, and anti-grief server options', () => {
    const keysFor = (category: string) => liveSettingDefinitions
      .filter((definition) => definition.category === category)
      .map((definition) => definition.key)

    expect(keysFor('Voice')).toEqual([
      'VoiceEnable',
      'VoiceMinDistance',
      'VoiceMaxDistance',
      'Voice3D',
    ])
    expect(keysFor('Factions')).toEqual([
      'Faction',
      'FactionDaySurvivedToCreate',
      'FactionPlayersRequiredForTag',
    ])
    expect(keysFor('Anti-grief')).toEqual([
      'NoFire',
      'AllowDestructionBySledgehammer',
      'SledgehammerOnlyInSafehouse',
      'ItemNumbersLimitPerContainer',
      'DisableVehicleTowing',
      'DisableTrailerTowing',
      'DisableBurntTowing',
      'BanKickGlobalSound',
    ])
  })

  it('accepts bounded voice decimals and rejects an inverted voice range', () => {
    const service = new LiveSettingsService({ VoiceMinDistance: 10, VoiceMaxDistance: 100 })

    expect(service.buildChange('VoiceMinDistance', '12.5')).toMatchObject({
      value: 12.5,
      command: 'changeoption VoiceMinDistance "12.5"',
    })
    expect(() => service.buildChange('VoiceMinDistance', 100.1)).toThrow('cannot exceed')
    expect(() => service.buildChange('VoiceMaxDistance', 9.9)).toThrow('cannot be less')
    expect(() => service.buildChange('VoiceMaxDistance', Number.POSITIVE_INFINITY)).toThrow('valid decimal')
  })

  it('refreshes available values from RCON and retains configured fallback values for truncated output', async () => {
    const service = new LiveSettingsService({ GlobalChat: false, PVP: true })
    const send = vi.fn().mockResolvedValue('List of Server Options:\n* GlobalChat=true')

    const snapshot = await service.snapshot(send)

    expect(send).toHaveBeenCalledWith('showoptions')
    expect(snapshot.settings.find((setting) => setting.key === 'GlobalChat')).toMatchObject({ value: true, source: 'live' })
    expect(snapshot.settings.find((setting) => setting.key === 'PVP')).toMatchObject({ value: true, source: 'configured' })
  })

  it('retains a previously changed value when a dashboard restart receives truncated live output', async () => {
    const service = new LiveSettingsService(
      { ShowFirstAndLastName: true },
      { ShowFirstAndLastName: { value: false, updatedAt: '2026-07-17T18:00:00.000Z', updatedBy: 'Admin' } },
    )

    const snapshot = await service.snapshot(vi.fn().mockResolvedValue('List of Server Options:\n* GlobalChat=true'))

    expect(snapshot.settings.find((setting) => setting.key === 'ShowFirstAndLastName')).toMatchObject({
      value: false,
      source: 'changed',
      requiresPlayerReconnect: true,
    })
  })

  it('keeps the page usable with configured values when RCON refresh is unavailable', async () => {
    const service = new LiveSettingsService({ GlobalChat: true })
    const snapshot = await service.snapshot(vi.fn().mockRejectedValue(new Error('offline')))

    expect(snapshot.warning).toContain('could not be refreshed')
    expect(snapshot.settings.find((setting) => setting.key === 'GlobalChat')).toMatchObject({ value: true, source: 'configured' })
  })

  it('refreshes configured fallbacks without replacing live or changed values', async () => {
    const service = new LiveSettingsService({ MaxPlayers: 10, SaveWorldEveryMinutes: 15 })
    await service.snapshot(async () => '* MaxPlayers=12')
    service.commit('SaveWorldEveryMinutes', 30)

    service.importConfigured({ MaxPlayers: 20, SaveWorldEveryMinutes: 45, PingLimit: 400 })
    const snapshot = await service.snapshot(async () => { throw new Error('RCON unavailable') })

    expect(snapshot.settings.find((setting) => setting.key === 'MaxPlayers')).toMatchObject({ value: 12, source: 'live' })
    expect(snapshot.settings.find((setting) => setting.key === 'SaveWorldEveryMinutes')).toMatchObject({ value: 30, source: 'changed' })
    expect(snapshot.settings.find((setting) => setting.key === 'PingLimit')).toMatchObject({ value: 400, source: 'configured' })
  })

  it('classifies rejected server replies as failures', () => {
    expect(() => validateLiveSettingOutput('Unknown option: Nope')).toThrow('rejected')
    expect(validateLiveSettingOutput('Option GlobalChat is now false')).toBe('Option GlobalChat is now false')
  })
})
