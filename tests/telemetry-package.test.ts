import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve('../server-telemetry/DoomedTelemetry')

function packageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? packageFiles(path) : [path]
  })
}

describe('server telemetry utility package', () => {
  it('is unmistakably labeled as a server utility rather than a mod', () => {
    const readme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8')
    const notice = readFileSync(resolve(packageRoot, 'NOT_A_MOD.txt'), 'utf8')
    const exporter = readFileSync(resolve(packageRoot, 'server-files/media/lua/server/DoomedTelemetry_Server.lua'), 'utf8')

    expect(readme).toContain('not a Project Zomboid mod or Steam Workshop item')
    expect(notice).toContain('THIS PACKAGE IS NOT A PROJECT ZOMBOID MOD OR STEAM WORKSHOP ITEM')
    expect(exporter).toContain('THIS IS NOT A MOD OR WORKSHOP ITEM')
    expect(exporter).toContain('vehicle:getKeyId()')
  })

  it('contains no Project Zomboid mod or Workshop package metadata', () => {
    const relativeFiles = packageFiles(packageRoot).map((path) => path.slice(packageRoot.length + 1))
    expect(relativeFiles).not.toContain('workshop.txt')
    expect(relativeFiles.some((path) => path.endsWith('mod.info'))).toBe(false)
    expect(existsSync(resolve('pz-mod'))).toBe(false)
  })
})
