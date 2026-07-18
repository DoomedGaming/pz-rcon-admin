interface StartupSecurityInput {
  host: string
  dashboardPassword: string
  playerAuthEnabled: boolean
  secureConfigConfigured: boolean
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])

export function assertStartupSecurity(input: StartupSecurityInput): void {
  // An unconfigured instance exposes only the token-protected setup flow and
  // health endpoint. The setup form requires a dashboard password before it can
  // create the encrypted configuration. Once configured, fail closed if that
  // password is ever absent.
  if (!input.secureConfigConfigured) return

  if (!loopbackHosts.has(input.host) && !input.dashboardPassword) {
    throw new Error('DASHBOARD_PASSWORD is required when HOST is not loopback')
  }

  if (input.playerAuthEnabled && !input.dashboardPassword) {
    throw new Error('DASHBOARD_PASSWORD or a readable Project Zomboid administrator secret is required when player authentication is enabled')
  }
}
