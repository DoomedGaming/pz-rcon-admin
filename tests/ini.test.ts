import { describe, expect, it } from 'vitest'
import { parseIni, parseSandboxLua, summarizeConfig } from '../src/server/ini.js'

describe('Project Zomboid configuration parsing', () => {
  it('keeps values containing equals signs', () => {
    expect(parseIni('PublicName=Doomed Gaming\nServerWelcomeMessage=A=B')).toEqual({
      PublicName: 'Doomed Gaming',
      ServerWelcomeMessage: 'A=B',
    })
  })

  it('redacts secrets from the browser-safe summary', () => {
    const summary = summarizeConfig(parseIni([
      'PublicName=Doomed Gaming',
      'MaxPlayers=10',
      'PVP=True',
      'RCONPassword=do-not-leak',
      'DiscordToken=do-not-leak-either',
      'Mods=Alpha;Beta',
      'WorkshopItems=123;456',
    ].join('\n')))
    expect(summary.name).toBe('Doomed Gaming')
    expect(summary.mods).toEqual(['Alpha', 'Beta'])
    expect(summary.values).not.toHaveProperty('RCONPassword')
    expect(summary.values).not.toHaveProperty('DiscordToken')
  })

  it('flattens nested SandboxVars tables', () => {
    const values = parseSandboxLua('SandboxVars = {\n  Zombies = 4,\n  ZombieLore = {\n    Speed = 2,\n  },\n}')
    expect(values['SandboxVars.Zombies']).toBe(4)
    expect(values['SandboxVars.ZombieLore.Speed']).toBe(2)
  })
})
