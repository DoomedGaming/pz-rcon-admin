import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Rcon } from 'rcon-client'
import { parsePlayersResponse } from '../src/server/rcon.js'
import { PzRconService } from '../src/server/rcon.js'

const settings = {
  host: '127.0.0.1',
  port: 27_015,
  password: 'test-only',
  pollSeconds: 5,
  demo: false,
}

function client(options: {
  connect?: () => Promise<unknown>
  response?: string
  end?: () => Promise<void>
}) {
  const destroy = vi.fn()
  const value = {
    connect: vi.fn(options.connect ?? (() => Promise.resolve())),
    send: vi.fn(async () => options.response ?? 'Players connected (0):'),
    end: vi.fn(options.end ?? (() => Promise.resolve())),
    on: vi.fn(),
    socket: { destroy },
  } as unknown as Rcon
  return { value, destroy }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('parsePlayersResponse', () => {
  it('parses the standard Project Zomboid response', () => {
    expect(parsePlayersResponse('Players connected (2):\n-Alice\n-Bob')).toEqual(['Alice', 'Bob'])
  })

  it('accepts numbered and username-prefixed variants', () => {
    expect(parsePlayersResponse('Players:\n1. Alice\nusername=Bob\nAlice')).toEqual(['Alice', 'Bob'])
  })

  it('keeps connected usernames that differ only by casing separate', () => {
    expect(parsePlayersResponse('Players connected (2):\n-howop\n-Howop')).toEqual(['howop', 'Howop'])
  })

  it('returns an empty list when nobody is connected', () => {
    expect(parsePlayersResponse('Players connected (0):\nNo players connected')).toEqual([])
  })
})

describe('PzRconService connection lifecycle', () => {
  it('forces a stalled close and continues with the next queued poll', async () => {
    vi.useFakeTimers()
    const first = client({
      response: 'Players connected (1):\n-Alice',
      end: () => new Promise<void>(() => undefined),
    })
    const second = client({ response: 'Players connected (1):\n-Bob' })
    const createClient = vi.fn()
      .mockReturnValueOnce(first.value)
      .mockReturnValueOnce(second.value)
    const service = new PzRconService(settings, createClient)

    const firstPoll = service.pollPlayers()
    const secondPoll = service.pollPlayers()
    await vi.advanceTimersByTimeAsync(999)

    expect(createClient).toHaveBeenCalledTimes(1)
    expect(first.destroy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    await expect(firstPoll).resolves.toEqual(['Alice'])
    await expect(secondPoll).resolves.toEqual(['Bob'])
    expect(first.destroy).toHaveBeenCalledOnce()
    expect(createClient).toHaveBeenCalledTimes(2)
  })

  it('destroys a timed-out connecting socket and allows a later poll', async () => {
    vi.useFakeTimers()
    const first = client({
      connect: () => new Promise<never>(() => undefined),
      end: () => Promise.reject(new Error('Not connected')),
    })
    const second = client({ response: 'Players connected (1):\n-Alice' })
    const createClient = vi.fn()
      .mockReturnValueOnce(first.value)
      .mockReturnValueOnce(second.value)
    const service = new PzRconService(settings, createClient)

    const failedPoll = service.pollPlayers()
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(failedPoll).resolves.toBeNull()
    expect(first.destroy).toHaveBeenCalledOnce()
    await expect(service.pollPlayers()).resolves.toEqual(['Alice'])
    expect(createClient).toHaveBeenCalledTimes(2)
  })
})
