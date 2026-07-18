import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DashboardStore } from '../src/server/store.js'
import { normalizeSupportRequestInput, normalizeSupportRequestMessage } from '../src/shared/support-requests.js'

describe('support request validation', () => {
  it('accepts only allowlisted categories and requires a player-report target', () => {
    expect(normalizeSupportRequestInput({
      category: 'unstuck',
      subject: 'Blocked in a wall',
      detail: 'I cannot move away from the wall beside the warehouse.',
    })).toMatchObject({ category: 'unstuck', subject: 'Blocked in a wall' })

    expect(() => normalizeSupportRequestInput({
      category: 'player-report',
      subject: 'Player report',
      detail: 'This message is long enough to pass validation.',
    })).toThrow('Survivor username is required')
    expect(() => normalizeSupportRequestInput({ category: 'admin-command', subject: 'Nope', detail: 'This should never be accepted.' })).toThrow('valid request category')
  })

  it('bounds user-controlled request and comment text', () => {
    expect(normalizeSupportRequestMessage('  Thanks for checking.  ')).toBe('Thanks for checking.')
    expect(() => normalizeSupportRequestMessage('')).toThrow('at least 1')
    expect(() => normalizeSupportRequestInput({ category: 'help', subject: 'Hi', detail: 'Long enough request details.' })).toThrow('at least 3')
  })
})

describe('persisted support request workflow', () => {
  it('stores telemetry context, comments, claims, status changes, and reloads safely', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-support-requests-'))
    const path = join(directory, 'dashboard.json')
    try {
      const store = new DashboardStore(path)
      const created = store.createSupportRequest({
        category: 'unstuck',
        createdBy: 'Doom',
        subject: 'Blocked in a wall',
        detail: 'I cannot move away from the warehouse wall.',
        location: { x: 10833, y: 10012, z: 0, observedAt: '2026-07-17T20:00:00.000Z' },
      }, new Date('2026-07-17T20:01:00.000Z'))

      expect(created).toMatchObject({ status: 'open', createdBy: 'Doom', location: { x: 10833 } })
      store.addSupportRequestMessage(created.id, 'Doom', 'user', 'I am still stuck.', new Date('2026-07-17T20:02:00.000Z'))
      expect(store.claimSupportRequest(created.id, 'Moderator', new Date('2026-07-17T20:03:00.000Z'))).toMatchObject({ status: 'claimed', claimedBy: 'Moderator' })
      store.addSupportRequestMessage(created.id, 'Moderator', 'moderator', 'I am checking your location now.', new Date('2026-07-17T20:04:00.000Z'))
      expect(store.setSupportRequestStatus(created.id, 'approved', 'Moderator', new Date('2026-07-17T20:05:00.000Z')).status).toBe('approved')
      expect(store.setSupportRequestStatus(created.id, 'completed', 'Moderator', new Date('2026-07-17T20:06:00.000Z')).status).toBe('completed')

      const reloaded = new DashboardStore(path).getSupportRequestsForUser('DOOM')[0]
      expect(reloaded).toMatchObject({ status: 'completed', claimedBy: 'Moderator' })
      expect(reloaded.messages).toHaveLength(2)
      reloaded.messages[0].body = 'mutated'
      expect(store.getSupportRequest(created.id)?.messages[0].body).toBe('I am still stuck.')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('enforces ownership-friendly ordering, active limits, claim locks, and valid transitions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pz-support-limits-'))
    try {
      const store = new DashboardStore(join(directory, 'dashboard.json'))
      const first = store.createSupportRequest({ category: 'help', createdBy: 'Alice', subject: 'Help one', detail: 'This is the first request.' })
      expect(store.getSupportRequestsForUser('alice')).toHaveLength(1)
      expect(store.claimSupportRequest(first.id, 'Mod One').claimedBy).toBe('Mod One')
      expect(() => store.claimSupportRequest(first.id, 'Mod Two')).toThrow('already claimed')
      expect(() => store.setSupportRequestStatus(first.id, 'completed', 'Mod One')).not.toThrow()
      expect(() => store.setSupportRequestStatus(first.id, 'approved', 'Mod One')).toThrow('cannot move directly')

      for (let index = 0; index < 5; index += 1) {
        store.createSupportRequest({ category: 'help', createdBy: 'Bob', subject: `Help ${index}`, detail: `This is active request number ${index}.` })
      }
      expect(() => store.createSupportRequest({ category: 'help', createdBy: 'Bob', subject: 'One more', detail: 'This request exceeds the active limit.' })).toThrow('five active requests')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
