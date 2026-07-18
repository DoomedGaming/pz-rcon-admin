import type { SupportRequestCategory, SupportRequestStatus } from './types.js'

export const supportRequestCategories: Array<{
  id: SupportRequestCategory
  label: string
  description: string
  targetLabel?: string
  targetRequired?: boolean
}> = [
  { id: 'help', label: 'General help', description: 'Ask staff for assistance with the server or your account.' },
  { id: 'unstuck', label: 'Unstuck', description: 'Request help escaping a blocked or unsafe location.' },
  { id: 'player-report', label: 'Player report', description: 'Privately report another survivor and explain what happened.', targetLabel: 'Survivor username', targetRequired: true },
  { id: 'safehouse', label: 'Safehouse', description: 'Request ownership, transfer, release, or access assistance.', targetLabel: 'Safehouse owner or member' },
  { id: 'voice', label: 'Voice chat', description: 'Request voice-chat assistance or appeal a voice restriction.', targetLabel: 'Related survivor username' },
]

export const supportRequestStatuses: SupportRequestStatus[] = ['open', 'claimed', 'approved', 'denied', 'completed']
export const activeSupportRequestStatuses: SupportRequestStatus[] = ['open', 'claimed', 'approved']

export function isSupportRequestCategory(value: unknown): value is SupportRequestCategory {
  return supportRequestCategories.some((category) => category.id === value)
}

export function isSupportRequestStatus(value: unknown): value is SupportRequestStatus {
  return supportRequestStatuses.includes(value as SupportRequestStatus)
}

function cleanText(value: unknown, label: string, minimum: number, maximum: number): string {
  const text = String(value ?? '').trim().replace(/\r\n?/g, '\n')
  if (text.length < minimum) throw new Error(`${label} must be at least ${minimum} characters`)
  if (text.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer`)
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new Error(`${label} contains unsupported control characters`)
  return text
}

export function normalizeSupportRequestInput(input: unknown): {
  category: SupportRequestCategory
  subject: string
  detail: string
  targetUsername?: string
} {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (!isSupportRequestCategory(body.category)) throw new Error('Choose a valid request category')
  const definition = supportRequestCategories.find((category) => category.id === body.category)!
  const targetUsername = String(body.targetUsername ?? '').trim()
  if (definition.targetRequired && !targetUsername) throw new Error(`${definition.targetLabel} is required`)
  if (targetUsername.length > 64) throw new Error(`${definition.targetLabel ?? 'Related username'} must be 64 characters or fewer`)
  if (/[\u0000-\u001F\u007F]/.test(targetUsername)) throw new Error(`${definition.targetLabel ?? 'Related username'} contains unsupported characters`)
  return {
    category: body.category,
    subject: cleanText(body.subject, 'Subject', 3, 100),
    detail: cleanText(body.detail, 'Request details', 10, 2_000),
    ...(targetUsername ? { targetUsername } : {}),
  }
}

export function normalizeSupportRequestMessage(value: unknown): string {
  return cleanText(value, 'Message', 1, 1_000)
}
