import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dispatch, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { readAgUiSseStream } from '@/lib/ag-ui/events'
import {
  useChatSendTurn,
  type UseChatSendTurnOptions,
} from './useChatSendTurn'
import type { ChatStreamMessage } from './chat-sse-handlers'

vi.mock('@/lib/ag-ui/events', () => ({
  readAgUiSseStream: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

interface TestMessage extends ChatStreamMessage {
  timestamp: string
}

const t = ((key: string) => key) as TFunction

function applySetMessagesUpdate(
  messages: TestMessage[],
  updater: SetStateAction<TestMessage[]>,
): TestMessage[] {
  return typeof updater === 'function' ? updater(messages) : updater
}

function makeSetMessages(initial: TestMessage[] = []) {
  let messages = [...initial]
  const setMessages = vi.fn((updater: SetStateAction<TestMessage[]>) => {
    messages = applySetMessagesUpdate(messages, updater)
  }) as unknown as Dispatch<SetStateAction<TestMessage[]>> & {
    getMessages: () => TestMessage[]
  }

  ;(setMessages as { getMessages: () => TestMessage[] }).getMessages = () => messages

  return setMessages as Dispatch<SetStateAction<TestMessage[]>> & {
    getMessages: () => TestMessage[]
  }
}

function makeStreaming() {
  return {
    streamContentRef: { current: new Map<string, string>() },
    streamRafRef: { current: null as number | null },
    flushStreamingContent: vi.fn(),
    appendStreamingDelta: vi.fn(),
    clearStreamingBuffers: vi.fn(),
    setStreamStatus: vi.fn(),
    setActivityLog: vi.fn(),
    setLiveMcpToolCalls: vi.fn(),
  }
}

function makeHookOptions(
  overrides: Partial<UseChatSendTurnOptions<TestMessage>> = {},
): UseChatSendTurnOptions<TestMessage> {
  const setMessages = overrides.setMessages ?? makeSetMessages()
  const streaming = overrides.streaming ?? makeStreaming()

  return {
    messages: overrides.messages ?? [],
    setMessages,
    refetchCurrentSession: vi.fn().mockResolvedValue(undefined),
    queryClient: {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    },
    chatQueue: {
      ensureRunner: vi.fn().mockResolvedValue(undefined),
    },
    streaming,
    t,
    ensureSession: vi.fn().mockResolvedValue('session-1'),
    buildSendRequest: vi.fn().mockResolvedValue(new ReadableStream<Uint8Array>()),
    ...overrides,
  } as UseChatSendTurnOptions<TestMessage>
}

describe('useChatSendTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readAgUiSseStream).mockResolvedValue(undefined)
  })

  it('inserts an optimistic user message before the stream completes', async () => {
    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatSendTurn<TestMessage>(makeHookOptions({ setMessages })),
    )

    await act(async () => {
      await result.current.sendMessage('Hello there')
    })

    const messages = setMessages.getMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('human')
    expect(messages[0].content).toBe('Hello there')
    expect(messages[0].id.startsWith('temp-')).toBe(true)
    expect(readAgUiSseStream).toHaveBeenCalledTimes(1)
  })

  it('aborts without inserting when ensureSession returns null', async () => {
    const setMessages = makeSetMessages()
    const ensureSession = vi.fn().mockResolvedValue(null)

    const { result } = renderHook(() =>
      useChatSendTurn<TestMessage>(
        makeHookOptions({ setMessages, ensureSession }),
      ),
    )

    await act(async () => {
      await result.current.sendMessage('Hello there')
    })

    expect(setMessages.getMessages()).toEqual([])
    expect(readAgUiSseStream).not.toHaveBeenCalled()
  })

  it('rolls back optimistic messages when the stream fails', async () => {
    vi.mocked(readAgUiSseStream).mockRejectedValue(new Error('Network error'))

    const setMessages = makeSetMessages([
      {
        id: 'existing-1',
        type: 'human',
        content: 'Previous message',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ])

    const { result } = renderHook(() =>
      useChatSendTurn<TestMessage>(
        makeHookOptions({
          messages: setMessages.getMessages(),
          setMessages,
        }),
      ),
    )

    await act(async () => {
      await result.current.sendMessage('Hello there')
    })

    expect(setMessages.getMessages()).toEqual([
      {
        id: 'existing-1',
        type: 'human',
        content: 'Previous message',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ])
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('does not roll back optimistic messages on AbortError', async () => {
    vi.mocked(readAgUiSseStream).mockRejectedValue(
      new DOMException('Aborted', 'AbortError'),
    )

    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatSendTurn<TestMessage>(makeHookOptions({ setMessages })),
    )

    await act(async () => {
      await result.current.sendMessage('Hello there')
    })

    expect(setMessages.getMessages()).toHaveLength(1)
    expect(setMessages.getMessages()[0].content).toBe('Hello there')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sets isSending while the turn is in flight and clears it afterward', async () => {
    let resolveStream: (() => void) | undefined
    vi.mocked(readAgUiSseStream).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStream = resolve
        }),
    )

    const { result } = renderHook(() =>
      useChatSendTurn<TestMessage>(makeHookOptions()),
    )

    let sendPromise: Promise<void> | undefined
    act(() => {
      sendPromise = result.current.sendMessage('Hello there')
    })

    await waitFor(() => {
      expect(result.current.isSending).toBe(true)
    })

    await act(async () => {
      resolveStream?.()
      await sendPromise
    })

    expect(result.current.isSending).toBe(false)
  })
})
