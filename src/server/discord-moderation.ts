import type { SupportRequest } from '../shared/types.js'
import type { ModeratorPlayerAction } from './commands.js'

const DISCORD_EMBED_COLOR = 0xa7b46a
const DISCORD_WEBHOOK_PATH = /^\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/([A-Za-z0-9._-]{20,})\/?$/

type DiscordField = { name: string; value: string; inline?: boolean }

interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields: DiscordField[]
  footer: { text: string }
  timestamp: string
}

export interface DiscordWebhookPayload {
  username: string
  allowed_mentions: { parse: [] }
  embeds: DiscordEmbed[]
}

export type ModerationNotification =
  | { kind: 'request-created'; request: SupportRequest }
  | { kind: 'request-player-reply'; request: SupportRequest; message: string }
  | { kind: 'request-staff-reply'; request: SupportRequest; actor: string; message: string }
  | { kind: 'request-updated'; request: SupportRequest; actor: string; action: 'claim' | 'status' }
  | { kind: 'player-action'; action: ModeratorPlayerAction; actor: string; target: string; reason: string }

type FetchImplementation = (input: string | URL, init?: RequestInit) => Promise<Response>

function clean(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]()#+\-.!|>])/g, '\\$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength) || 'Not provided'
}

function categoryLabel(category: SupportRequest['category']): string {
  return ({
    help: 'General help',
    unstuck: 'Stuck survivor',
    'player-report': 'Player report',
    safehouse: 'Safehouse help',
    voice: 'Voice chat help',
  })[category]
}

function statusLabel(status: SupportRequest['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function actionLabel(action: ModeratorPlayerAction): string {
  return ({
    kick: 'Kicked survivor',
    ban: 'Banned survivor',
    'remove-whitelist': 'Removed survivor from whitelist',
  })[action]
}

function requestFields(request: SupportRequest): DiscordField[] {
  const fields: DiscordField[] = [
    { name: 'Survivor', value: clean(request.createdBy, 256), inline: true },
    { name: 'Category', value: categoryLabel(request.category), inline: true },
    { name: 'Request ID', value: clean(request.id, 256), inline: true },
    { name: 'Subject', value: clean(request.subject, 1_024) },
  ]
  if (request.targetUsername) fields.push({ name: 'Reported survivor', value: clean(request.targetUsername, 1_024) })
  return fields
}

export function buildDiscordModerationPayload(notification: ModerationNotification, now = new Date()): DiscordWebhookPayload {
  const embed: DiscordEmbed = {
    title: '',
    color: DISCORD_EMBED_COLOR,
    fields: [],
    footer: { text: 'PZ RCON Admin • Moderator notifications only' },
    timestamp: now.toISOString(),
  }

  switch (notification.kind) {
    case 'request-created':
      embed.title = 'New support request'
      embed.description = clean(notification.request.detail, 4_096)
      embed.fields = requestFields(notification.request)
      break
    case 'request-player-reply':
      embed.title = 'Survivor replied to a request'
      embed.description = clean(notification.message, 4_096)
      embed.fields = requestFields(notification.request)
      break
    case 'request-staff-reply':
      embed.title = 'Staff replied to a request'
      embed.description = clean(notification.message, 4_096)
      embed.fields = [
        { name: 'Staff member', value: clean(notification.actor, 256), inline: true },
        ...requestFields(notification.request),
      ]
      break
    case 'request-updated':
      embed.title = notification.action === 'claim' ? 'Support request claimed' : 'Support request status changed'
      embed.fields = [
        { name: 'Staff member', value: clean(notification.actor, 256), inline: true },
        { name: 'Status', value: statusLabel(notification.request.status), inline: true },
        ...requestFields(notification.request),
      ]
      break
    case 'player-action':
      embed.title = actionLabel(notification.action)
      embed.fields = [
        { name: 'Staff member', value: clean(notification.actor, 256), inline: true },
        { name: 'Survivor', value: clean(notification.target, 256), inline: true },
        { name: 'Reason', value: clean(notification.reason, 1_024) },
      ]
      break
  }

  return {
    username: 'PZ Admin Notifications',
    allowed_mentions: { parse: [] },
    embeds: [embed],
  }
}

export function normalizeDiscordWebhookUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Discord moderator webhook must be a valid URL')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !DISCORD_WEBHOOK_PATH.test(url.pathname)) {
    throw new Error('Discord moderator webhook must be an HTTPS discord.com channel webhook URL')
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  url.search = ''
  return url.toString()
}

export class DiscordModerationNotifier {
  readonly configured: boolean
  private readonly webhookUrl?: string

  constructor(webhookUrl: string | undefined, private readonly fetchImplementation: FetchImplementation = fetch) {
    this.webhookUrl = webhookUrl ? normalizeDiscordWebhookUrl(webhookUrl) : undefined
    this.configured = Boolean(this.webhookUrl)
  }

  async send(notification: ModerationNotification): Promise<boolean> {
    if (!this.webhookUrl) return false
    const url = new URL(this.webhookUrl)
    url.searchParams.set('wait', 'true')
    const response = await this.fetchImplementation(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDiscordModerationPayload(notification)),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`)
    return true
  }
}
