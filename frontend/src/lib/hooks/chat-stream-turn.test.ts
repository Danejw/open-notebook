import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultAiMessage,
  createOptimisticHumanMessage,
  defaultSessionTitleFromMessage,
  ensureChatSessionForMessage,
} from '@/lib/hooks/chat-stream-turn'

describe('chat-stream-turn', () => {
  it('creates optimistic human messages with temp id', () => {
    const message = createOptimisticHumanMessage('Hello')
    expect(message.type).toBe('human')
    expect(message.content).toBe('Hello')
    expect(message.id.startsWith('temp-')).toBe(true)
    expect(message.timestamp).toBeTruthy()
  })

  it('truncates long session titles', () => {
    const long = 'a'.repeat(40)
    expect(defaultSessionTitleFromMessage(long)).toBe(`${'a'.repeat(30)}...`)
    expect(defaultSessionTitleFromMessage('short')).toBe('short')
  })

  it('creates default AI messages', () => {
    const message = createDefaultAiMessage<{ id: string; type: 'ai'; content: string; timestamp?: string }>(
      'ai-1',
      'reply'
    )
    expect(message).toEqual({
      id: 'ai-1',
      type: 'ai',
      content: 'reply',
      timestamp: expect.any(String),
    })
  })

  it('reuses existing session id when present', async () => {
    const createSession = vi.fn()
    const result = await ensureChatSessionForMessage({
      currentSessionId: 'session-1',
      message: 'hello',
      createSession,
    })
    expect(result).toEqual({ sessionId: 'session-1', created: false })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('auto-creates session from first message', async () => {
    const createSession = vi.fn().mockResolvedValue({ id: 'session-new' })
    const result = await ensureChatSessionForMessage({
      currentSessionId: null,
      message: 'first prompt',
      createSession,
    })
    expect(result).toEqual({ sessionId: 'session-new', created: true })
    expect(createSession).toHaveBeenCalledWith('first prompt')
  })
})
