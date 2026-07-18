import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

describe('GitHub Pages project site', () => {
  it('publishes a landing page and setup guide with project-relative links', () => {
    const landing = read('site/index.html')
    const docs = read('site/docs/index.html')
    const packageJson = JSON.parse(read('package.json'))

    expect(landing).toContain('Run the server.')
    expect(landing).toContain('href="docs/"')
    expect(landing).toContain(`v${packageJson.version}`)
    expect(docs).toContain('Docker quick start')
    expect(docs).toContain('ghcr.io/doomedgaming/pz-rcon-admin:latest')
    expect(docs).toContain('Lua/PZRconAdminTelemetry/players.json')
    expect(docs).toContain('3767189432')
    expect(docs).toContain(`v${packageJson.version}`)
  })

  it('deploys only the static site through the official Pages artifact workflow', () => {
    const workflow = read('.github/workflows/pages.yml')

    expect(workflow).toContain('pages: write')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain('actions/configure-pages@')
    expect(workflow).toContain('actions/upload-pages-artifact@')
    expect(workflow).toContain('path: site')
    expect(workflow).toContain('actions/deploy-pages@')
  })

  it('does not place secret configuration values in the public site', () => {
    const publicSite = [
      read('site/index.html'),
      read('site/docs/index.html'),
      read('site/assets/site.js'),
    ].join('\n')

    expect(publicSite).not.toMatch(/DASHBOARD_PASSWORD\s*=/)
    expect(publicSite).not.toMatch(/PZ_RCON_PASSWORD\s*=/)
    expect(publicSite).not.toMatch(/PZ_TELEMETRY_FTP_PASSWORD\s*=/)
    expect(publicSite).not.toMatch(/token=[A-Za-z0-9_-]{20,}/)
  })
})
