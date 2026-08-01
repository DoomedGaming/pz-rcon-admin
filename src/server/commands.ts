import type { CommandDefinition } from '../shared/types.js'
import { resolvePlayerXpPerk } from '../shared/perks.js'

export const commandDefinitions: CommandDefinition[] = [
  { id: 'save', label: 'Save world', description: 'Write the current world state to disk.', category: 'server', command: 'save', impact: 'safe' },
  { id: 'reload-options', label: 'Reload options', description: 'Reload server options and send supported changes to clients.', category: 'server', command: 'reloadoptions', impact: 'caution' },
  { id: 'check-mods', label: 'Check mod updates', description: 'Ask the server to check Workshop mods; details are written to the server log.', category: 'maintenance', command: 'checkModsNeedUpdate', impact: 'safe' },
  { id: 'announce', label: 'Broadcast message', description: 'Send a message to everyone online.', category: 'server', command: 'servermsg {{message}}', args: [{ name: 'message', label: 'Message', required: true, placeholder: 'Server restart in 10 minutes' }], impact: 'safe' },
  { id: 'helicopter', label: 'Helicopter event', description: 'Trigger the helicopter event.', category: 'world', command: 'chopper', impact: 'caution' },
  { id: 'gunshot', label: 'Gunshot event', description: 'Trigger a distant gunshot sound.', category: 'world', command: 'gunshot', impact: 'caution' },
  { id: 'start-rain', label: 'Start rain', description: 'Start rain at a chosen intensity from 1 to 100 percent.', category: 'weather', command: 'startrain {{intensity}}', args: [{ name: 'intensity', label: 'Intensity', required: true }], impact: 'caution' },
  { id: 'start-storm', label: 'Start thunderstorm', description: 'Start a thunderstorm for a chosen number of in-game hours.', category: 'weather', command: 'startstorm {{duration}}', args: [{ name: 'duration', label: 'Duration (hours)', required: true }], impact: 'caution' },
  { id: 'stop-weather', label: 'Stop weather', description: 'Stop active rain and weather effects.', category: 'weather', command: 'stopweather', impact: 'safe' },
  { id: 'lightning', label: 'Lightning strike', description: 'Trigger lightning on a named online survivor.', category: 'world', command: 'lightning {{username}}', args: [{ name: 'username', label: 'Username', required: true }], impact: 'caution' },
  { id: 'create-horde', label: 'Create horde', description: 'Spawn a zombie horde near a named online survivor.', category: 'world', command: 'createhorde {{count}} {{username}}', args: [{ name: 'count', label: 'Count', required: true }, { name: 'username', label: 'Username', required: true }], impact: 'danger' },
  {
    id: 'remove-zombies',
    label: 'Remove zombies',
    description: 'Remove loaded zombies near exact world coordinates.',
    category: 'world',
    command: 'removezombies -radius {{radius}} -x {{x}} -y {{y}} -z {{z}} -reanimated false',
    args: [
      { name: 'radius', label: 'Radius', required: true },
      { name: 'x', label: 'X coordinate', required: true },
      { name: 'y', label: 'Y coordinate', required: true },
      { name: 'z', label: 'Z coordinate', required: true },
    ],
    impact: 'danger',
  },
  { id: 'quit', label: 'Shut down server', description: 'Save and stop the game process. Your hosting provider is required to start it again.', category: 'server', command: 'quit', impact: 'danger' },
]

function clean(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]/g, ' ').replace(/"/g, "'").trim().slice(0, 300)
}

function quote(value: unknown): string {
  return `"${clean(value)}"`
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}`)
  }
  return number
}

function gameIdentifier(value: unknown, label: string): string {
  const identifier = clean(value)
  if (!identifier) throw new Error(`${label} is required`)
  if (!/^[A-Za-z0-9.-]*[A-Za-z][A-Za-z0-9_.-]*$/.test(identifier)) {
    throw new Error(`${label} is not a valid Project Zomboid identifier`)
  }
  return identifier
}

export function buildDefinedCommand(id: string, args: Record<string, unknown> = {}): { definition: CommandDefinition; command: string } {
  const definition = commandDefinitions.find((item) => item.id === id)
  if (!definition) throw new Error('Unknown command')
  if (definition.id === 'remove-zombies') {
    const radius = boundedInteger(args.radius, 'Radius', 1, 100)
    const x = boundedInteger(args.x, 'X coordinate', 0, 1_000_000)
    const y = boundedInteger(args.y, 'Y coordinate', 0, 1_000_000)
    const z = boundedInteger(args.z, 'Z coordinate', -31, 31)
    return { definition, command: `removezombies -radius ${radius} -x ${x} -y ${y} -z ${z} -reanimated false` }
  }
  if (definition.id === 'create-horde') {
    const count = boundedInteger(args.count, 'Count', 1, 500)
    const username = clean(args.username)
    if (!username) throw new Error('Username is required')
    return { definition, command: `createhorde ${count} ${quote(username)}` }
  }
  if (definition.id === 'start-rain') {
    return { definition, command: `startrain ${boundedInteger(args.intensity, 'Rain intensity', 1, 100)}` }
  }
  if (definition.id === 'start-storm') {
    return { definition, command: `startstorm ${boundedInteger(args.duration, 'Storm duration', 1, 168)}` }
  }
  let command = definition.command
  for (const argument of definition.args ?? []) {
    const value = clean(args[argument.name])
    if (argument.required && !value) throw new Error(`${argument.label} is required`)
    command = command.replace(`{{${argument.name}}}`, quote(value))
  }
  return { definition, command }
}

export type PlayerAction = 'kick' | 'ban' | 'godmode' | 'invisible' | 'noclip' | 'lightning' | 'horde' | 'additem' | 'addxp' | 'vehicle' | 'key' | 'teleport-coordinates' | 'teleport-player' | 'voiceban' | 'clear-map-symbols' | 'access-level' | 'remove-whitelist'
export type ModeratorPlayerAction = Extract<PlayerAction, 'kick' | 'ban' | 'remove-whitelist'>

const moderatorPlayerActions = new Set<PlayerAction>(['kick', 'ban', 'remove-whitelist'])

export function isModeratorPlayerAction(action: PlayerAction): action is ModeratorPlayerAction {
  return moderatorPlayerActions.has(action)
}

export function validateModerationReason(value: unknown): string {
  const reason = clean(value)
  if (!reason) throw new Error('A moderation reason is required')
  return reason
}

export interface TeleportPosition {
  x: number
  y: number
  z: number
}

function teleportCoordinate(value: unknown, label: string, maximum: number): number {
  const coordinate = Number(value)
  if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate > maximum) {
    throw new Error(`${label} must be a whole number from 0 to ${maximum}`)
  }
  return coordinate
}

export function buildPlayerCommand(username: string, action: PlayerAction, payload: Record<string, unknown> = {}): string {
  const user = quote(username)
  switch (action) {
    case 'kick': return `kickuser ${user} -r ${quote(validateModerationReason(payload.reason))}`
    case 'ban': return `banuser ${user} -r ${quote(validateModerationReason(payload.reason))}`
    case 'godmode': return `godmodeplayer ${user} -${payload.enabled === false ? 'false' : 'true'}`
    case 'invisible': return `invisibleplayer ${user} -${payload.enabled === false ? 'false' : 'true'}`
    case 'noclip': return `noclip ${user} -${payload.enabled === false ? 'false' : 'true'}`
    case 'lightning': return `lightning ${user}`
    case 'horde': return `createhorde ${boundedInteger(payload.count ?? 25, 'Count', 1, 500)} ${user}`
    case 'additem': return `additem ${user} ${quote(gameIdentifier(payload.item, 'Item'))} ${boundedInteger(payload.count ?? 1, 'Count', 1, 100)}`
    case 'addxp': {
      const perk = resolvePlayerXpPerk(payload.perk)
      if (!perk) throw new Error('Choose a valid XP skill')
      const amount = Number(payload.amount)
      if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) throw new Error('XP amount must be a whole number from 1 to 100000')
      return `addxp ${user} ${perk}=${amount} -true`
    }
    case 'vehicle': return `addvehicle ${quote(gameIdentifier(payload.script, 'Vehicle script'))} ${user}`
    case 'key': {
      const keyId = Number(payload.keyId)
      if (!Number.isInteger(keyId) || keyId < 0 || keyId > 2_147_483_647) throw new Error('Vehicle key ID must be a whole number')
      return `addkey ${user} ${quote(keyId)} ${quote(payload.name || 'Issued by admin')}`
    }
    case 'voiceban': return `voiceban ${user} -${payload.enabled === false ? 'false' : 'true'}`
    case 'clear-map-symbols': return `removemapsymbolsforuser ${user}`
    case 'access-level': {
      const level = clean(payload.level)
      if (!/^\w{1,64}$/.test(level)) throw new Error('Choose a valid in-game role')
      return `setaccesslevel ${user} ${level}`
    }
    case 'teleport-coordinates': {
      const x = teleportCoordinate(payload.x, 'X coordinate', 1_000_000)
      const y = teleportCoordinate(payload.y, 'Y coordinate', 1_000_000)
      const z = teleportCoordinate(payload.z, 'Z coordinate', 32)
      return `teleportto ${user} ${x},${y},${z}`
    }
    case 'teleport-player': {
      const destination = clean(payload.destination)
      if (!destination) throw new Error('Choose a destination survivor')
      if (destination.toLocaleLowerCase('en-US') === clean(username).toLocaleLowerCase('en-US')) {
        throw new Error('Choose a different destination survivor')
      }
      return `teleportplayer ${user} ${quote(destination)}`
    }
    case 'remove-whitelist': {
      validateModerationReason(payload.reason)
      return `removeuserfromwhitelist ${user}`
    }
    default: throw new Error('Unknown player action')
  }
}

// Build 42's two-player teleport command is inconsistent over RCON on some
// servers. Positions from the trusted telemetry bridge let the dashboard use
// the server's reliable coordinate form instead.
export function buildPlayerTeleportToPositionCommand(username: string, position: TeleportPosition): string {
  return buildPlayerCommand(username, 'teleport-coordinates', {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z),
  })
}

export function validatePlayerActionOutput(action: PlayerAction, output: string): string {
  if (/\bunknown command\b|\bcommand\b.*\b(?:not found|not recognized)\b/i.test(output)) {
    throw new Error('This Project Zomboid server build does not expose that RCON command')
  }
  if (/\bno such user\b|\buser\b.*\b(?:not found|doesn't exist)\b|\bcan't find player\b|\bno connection for player\b/i.test(output)) {
    throw new Error('Project Zomboid could not find that connected player')
  }
  if (/\bwrong arguments\b|\bnot enough rights\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the player action')
  }
  if (action === 'kick' && /\bthis user can't be kicked\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the kick request')
  }
  if (action === 'additem' && /\bitem\b.*\bdoesn't exist\b/i.test(output)) {
    throw new Error('Project Zomboid could not find that item')
  }
  if (action === 'access-level' && /\b(?:role|access level)\b.*\b(?:not found|doesn't exist|invalid)\b/i.test(output)) {
    throw new Error('Project Zomboid rejected that in-game role')
  }
  if (action === 'vehicle' && /\bunknown vehicle script\b|\binvalid location\b|\bi can not spawn\b/i.test(output)) {
    throw new Error('Project Zomboid rejected that vehicle spawn')
  }
  if (action === 'lightning' && /\bpass a username\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the lightning request')
  }
  if (action === 'horde' && /\bspecify a player\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the horde request')
  }
  if (action.startsWith('teleport') && /\b(?:error|failed|unable|cannot)\b.*\b(?:teleport|player|user)\b|\busage\s*:\s*\/?teleport/i.test(output)) {
    throw new Error('Project Zomboid rejected the teleport request')
  }
  if (action === 'addxp' && /list of available perks\s*:/i.test(output)) {
    throw new Error('Project Zomboid rejected that XP skill')
  }
  return output
}

export function validateDefinedCommandOutput(id: string, output: string): string {
  if (/\bunknown command\b|\bcommand\b.*\b(?:not found|not recognized)\b/i.test(output)) {
    throw new Error('This Project Zomboid server build does not expose that RCON command')
  }
  if (/\bwrong arguments\b|\bnot enough rights\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the server command')
  }
  if (id === 'create-horde' && /\bspecify a player\b|\buser\b.*\bnot found\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the horde request')
  }
  if (id === 'lightning' && /\bpass a username\b|\buser\b.*\bnot found\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the lightning request')
  }
  if (id === 'remove-zombies' && /\binvalid z\b/i.test(output)) {
    throw new Error('Project Zomboid rejected the zombie removal coordinates')
  }
  return output
}

export function validateRawCommand(value: unknown): string {
  const command = String(value ?? '').replace(/[\r\n]/g, ' ').trim()
  if (!command) throw new Error('Command is required')
  if (command.length > 500) throw new Error('Command is too long')
  return command
}
