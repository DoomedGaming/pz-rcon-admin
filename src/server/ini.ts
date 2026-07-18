import { readFileSync } from 'node:fs'
import type { ConfigSummary } from '../shared/types.js'

const SECRET_KEY = /(password|token|secret|webhook)/i

export function parseIni(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return values
}

export function readIni(path?: string): Record<string, string> {
  if (!path) return {}
  return parseIni(readFileSync(path, 'utf8'))
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback
  return value.toLowerCase() === 'true'
}

function number(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function list(value?: string): string[] {
  return (value ?? '').split(';').map((item) => item.trim()).filter(Boolean)
}

function publicValue(value: string): string | number | boolean {
  if (/^(true|false)$/i.test(value)) return bool(value)
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  return value
}

export function summarizeConfig(values: Record<string, string>): ConfigSummary {
  const safeValues = Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => !SECRET_KEY.test(key) && key !== 'Mods' && key !== 'WorkshopItems')
      .map(([key, value]) => [key, publicValue(value)]),
  )

  return {
    name: values.PublicName || 'Project Zomboid Server',
    map: values.Map || 'Muldraugh, KY',
    maxPlayers: number(values.MaxPlayers, 0),
    public: bool(values.Public),
    open: bool(values.Open),
    pvp: bool(values.PVP),
    pauseEmpty: bool(values.PauseEmpty),
    saveMinutes: number(values.SaveWorldEveryMinutes, 0),
    backupsOnStart: bool(values.BackupsOnStart),
    rconPort: values.RCONPort ? number(values.RCONPort, 0) : undefined,
    mods: list(values.Mods),
    workshopItems: list(values.WorkshopItems),
    values: safeValues,
  }
}

export function parseSandboxLua(text: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {}
  const stack: string[] = []
  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.trim()
    const objectMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{$/)
    if (objectMatch) {
      stack.push(objectMatch[1])
      continue
    }
    if (/^},?$/.test(line)) {
      stack.pop()
      continue
    }
    const valueMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?),?$/)
    if (!valueMatch || SECRET_KEY.test(valueMatch[1])) continue
    const raw = valueMatch[2].replace(/^['"]|['"]$/g, '')
    values[[...stack, valueMatch[1]].join('.')] = publicValue(raw)
  }
  return values
}
