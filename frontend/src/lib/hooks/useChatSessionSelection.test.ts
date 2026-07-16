import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { useChatSessionSelection } from './useChatSessionSelection'

interface TestSession {
  id: string
  messages?: { id: string; content: string }[]
}

function useTestChatSessionSelection(
  initialSessions: TestSession[],
  initialSessionId: string | null = null,
  prefetchSession?: (sessionId: string) => void
) {
  const [sessions] = useState(initialSessions)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    initialSessionId
  )
  const [messages, setMessages] = useState<{ id: string; content: string }[]>(
    []
  )
  const currentSession = sessions.find((s) => s.id === currentSessionId)

  useChatSessionSelection({
    sessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    setMessages,
    prefetchSession,
  })

  return { currentSessionId, messages, setCurrentSessionId }
}

describe('useChatSessionSelection', () => {
  it('auto-selects the first session when none is active', () => {
    const sessions = [
      { id: 's-new', messages: [] },
      { id: 's-old', messages: [] },
    ]
    const { result } = renderHook(() => useTestChatSessionSelection(sessions))

    expect(result.current.currentSessionId).toBe('s-new')
  })

  it('syncs messages when the active session payload changes', () => {
    const sessions = [
      {
        id: 's-1',
        messages: [{ id: 'm-1', content: 'Hello' }],
      },
    ]
    const { result } = renderHook(() =>
      useTestChatSessionSelection(sessions, 's-1')
    )

    expect(result.current.messages).toEqual([{ id: 'm-1', content: 'Hello' }])
  })

  it('prefetches the first session when a prefetch callback is provided', () => {
    const prefetchSession = vi.fn()
    const sessions = [{ id: 's-1' }, { id: 's-2' }]

    renderHook(() =>
      useTestChatSessionSelection(sessions, null, prefetchSession)
    )

    expect(prefetchSession).toHaveBeenCalledWith('s-1')
  })

  it('does not override an already selected session', () => {
    const sessions = [{ id: 's-1' }, { id: 's-2' }]
    const { result } = renderHook(() =>
      useTestChatSessionSelection(sessions, 's-2')
    )

    expect(result.current.currentSessionId).toBe('s-2')

    act(() => {
      result.current.setCurrentSessionId('s-1')
    })

    expect(result.current.currentSessionId).toBe('s-1')
  })
})
