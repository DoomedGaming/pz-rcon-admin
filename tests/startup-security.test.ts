import { describe, expect, it } from 'vitest'
import { assertStartupSecurity } from '../src/server/startup-security.js'

describe('startup network security', () => {
  it('allows an unconfigured network-bound instance to serve token-protected setup', () => {
    expect(() => assertStartupSecurity({
      host: '0.0.0.0',
      dashboardPassword: '',
      playerAuthEnabled: false,
      secureConfigConfigured: false,
    })).not.toThrow()
  })

  it('fails closed when an existing network-bound configuration loses its password', () => {
    expect(() => assertStartupSecurity({
      host: '0.0.0.0',
      dashboardPassword: '',
      playerAuthEnabled: false,
      secureConfigConfigured: true,
    })).toThrow('DASHBOARD_PASSWORD is required when HOST is not loopback')
  })

  it('allows configured network binding when the dashboard password is loaded', () => {
    expect(() => assertStartupSecurity({
      host: '0.0.0.0',
      dashboardPassword: 'encrypted-password',
      playerAuthEnabled: true,
      secureConfigConfigured: true,
    })).not.toThrow()
  })

  it('allows a configured passwordless instance only on loopback without player authentication', () => {
    expect(() => assertStartupSecurity({
      host: '127.0.0.1',
      dashboardPassword: '',
      playerAuthEnabled: false,
      secureConfigConfigured: true,
    })).not.toThrow()

    expect(() => assertStartupSecurity({
      host: '127.0.0.1',
      dashboardPassword: '',
      playerAuthEnabled: true,
      secureConfigConfigured: true,
    })).toThrow('DASHBOARD_PASSWORD or a readable Project Zomboid administrator secret is required when player authentication is enabled')
  })
})
