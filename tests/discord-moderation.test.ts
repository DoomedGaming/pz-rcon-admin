import { describe, expect, it, vi } from 'vitest'
import type { SupportRequest } from '../src/shared/types.js'
import { buildDiscordModerationPayload, DiscordModerationNotifier, normalizeDiscordWebhookUrl } from '../src/server/discord-moderation.js'

const request: SupportRequest = {
  id: 'request-123',
  category: 'player-report',
  status: 'open',
  createdBy: 'Alice',
  subject: 'Report @everyone',
  detail: 'Bob used **markdown** and <@123456789012345678>.',
  targetUsername: 'Bob',
  createdAt: '2026-07-28T20:00:00.000Z',
  updatedAt: '2026-07-28T20:00:00.000Z',
  messages: [],
}

describe('Discord moderation notifications', () => {
  it('accepts only channel-scoped Discord webhook URLs', () => {
    expect(normalizeDiscordWebhookUrl('https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_123456'))
      .toBe('https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_123456')
    expect(() => normalizeDiscordWebhookUrl('http://discord.com/api/webhooks/123456789012345678/token-token-token-token'))
      .toThrow('HTTPS discord.com')
    expect(() => normalizeDiscordWebhookUrl('https://example.com/api/webhooks/123456789012345678/token-token-token-token'))
      .toThrow('HTTPS discord.com')
    expect(() => normalizeDiscordWebhookUrl('https://discord.com/channels/123/456'))
      .toThrow('channel webhook URL')
  })

  it('builds scoped request and moderator-action embeds without allowing mentions', () => {
    const created = buildDiscordModerationPayload(
      { kind: 'request-created', request },
      new Date('2026-07-28T20:01:00.000Z'),
      'https://pz.example.test',
    )
    expect(created.allowed_mentions.parse).toEqual([])
    expect(created.embeds[0]).toMatchObject({ title: 'New support request', timestamp: '2026-07-28T20:01:00.000Z' })
    expect(created.embeds[0].description).toContain('\\*\\*markdown\\*\\*')
    expect(created.embeds[0].url).toBe('https://pz.example.test/mod?request=request-123')
    expect(created.embeds[0].fields).toContainEqual({
      name: 'Open request',
      value: '[Open this request in PZ Admin](https://pz.example.test/mod?request=request-123)',
    })

    const action = buildDiscordModerationPayload({
      kind: 'player-action',
      action: 'ban',
      actor: 'Moderator',
      target: 'Bob',
      reason: 'Repeated griefing',
    })
    expect(action.embeds[0]).toMatchObject({
      title: 'Banned survivor',
      fields: expect.arrayContaining([
        { name: 'Staff member', value: 'Moderator', inline: true },
        { name: 'Reason', value: 'Repeated griefing' },
      ]),
    })
  })

  it('posts with server confirmation and does nothing when unconfigured', async () => {
    let requestedUrl: string | URL | undefined
    let requestedInit: RequestInit | undefined
    const fetchImplementation = vi.fn(async (input: string | URL, init?: RequestInit) => {
      requestedUrl = input
      requestedInit = init
      return new Response('{}', { status: 200 })
    })
    const notifier = new DiscordModerationNotifier(
      'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_123456',
      'https://pz.example.test',
      fetchImplementation,
    )

    await expect(notifier.send({ kind: 'request-created', request })).resolves.toBe(true)
    expect(fetchImplementation).toHaveBeenCalledOnce()
    expect(String(requestedUrl)).toContain('wait=true')
    expect(requestedInit?.method).toBe('POST')
    expect(JSON.parse(String(requestedInit?.body))).toMatchObject({ allowed_mentions: { parse: [] } })

    await expect(new DiscordModerationNotifier(undefined, undefined, fetchImplementation).send({ kind: 'request-created', request })).resolves.toBe(false)
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })
})
