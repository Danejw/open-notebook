import { describe, it, expect, vi } from 'vitest'
import {
  deriveDefaultSessionTitle,
  createOptimisticUserMessage,
  stripOptimisticMessages,
  ensureChatSessionForMessage,
} from './chat-session-utils'

describe('deriveDefaultSessionTitle', () => {
  it('returns the full message when under the max length', () => {
    expect(deriveDefaultSessionTitle('Hello')).toBe('Hello')
  })

  it('truncates long messages with ellipsis', () => {
    const long = 'a'.repeat(40)
    expect(deriveDefaultSessionTitle(long)).toBe(`${'a'.repeat(30)}...`)
  })

  it('respects a custom max length', () => {
    expect(deriveDefaultSessionTitle('abcdefghij', 5)).toBe('abcde...')
  })
})

describe('createOptimisticUserMessage', () => {
  it('creates a human message with temp id', () => {
    const message = createOptimisticUserMessage('Hi there')
    expect(message.type).toBe('human')
    expect(message.content).toBe('Hi there')
    expect(message.id.startsWith('temp-')).toBe(true)
    expect(message.timestamp).toBeTruthy()
  })

  it('supports a custom factory', () => {
    const message = createOptimisticUserMessage('Hi', (content, id) => ({
      id,
      type: 'human' as const,
      content: `custom:${content}`,
    }))
    expect(message.content).toBe('custom:Hi')
  })
})

describe('stripOptimisticMessages', () => {
  it('removes temp-* messages', () => {
    const result = stripOptimisticMessages([
      { id: 'temp-1', content: 'x' },
      { id: 'real-1', content: 'y' },
    ])
    expect(result).toEqual([{ id: 'real-1', content: 'y' }])
  })
})

describe('ensureChatSessionForMessage', () => {
  it('returns the existing session without creating', async () => {
    const createSession = vi.fn()
    const result = await ensureChatSessionForMessage({
      currentSessionId: 'session-1',
      message: 'Hello',
      createSession,
    })
    expect(result).toEqual({
      sessionId: 'session-1',
      created: false,
      session: null,
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('creates a session when none is active', async () => {
    const createSession = vi
      .fn()
      .mockResolvedValue({ id: 'session-new', title: 'Hello' })
    const result = await ensureChatSessionForMessage({
      currentSessionId: null,
      message: 'Hello',
      createSession,
    })
    expect(createSession).toHaveBeenCalledWith('Hello')
    expect(result.sessionId).toBe('session-new')
    expect(result.created).toBe(true)
    expect(result.session).toEqual({ id: 'session-new', title: 'Hello' })
  })
})
