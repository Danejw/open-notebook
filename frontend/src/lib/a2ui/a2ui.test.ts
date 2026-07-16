import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseA2uiCustomEvent,
} from '@/lib/a2ui/parse-a2ui-event'
import { validateA2uiMessages, A2uiPolicyError } from '@/lib/a2ui/policy'
import { loadContextConfirmFixture } from '@/lib/a2ui/fixtures/load-context-confirm'
import { formatA2uiActionMessage } from '@/lib/a2ui/format-action-message'
import { COS_CATALOG_ID } from '@/lib/a2ui/constants'
import type { AgUiEvent } from '@/lib/ag-ui/events'
import {
  createAgUiChatSseHandler,
  type ChatStreamMessage,
} from '@/lib/hooks/chat-sse-handlers'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import type { ChatToolCall } from '@/lib/types/mcp'

vi.mock('@/lib/a2ui/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/a2ui/constants')>()
  return {
    ...actual,
    isA2uiChatEnabled: () => true,
  }
})

const applyMessages = vi.fn(() => ({ ok: true }))
const attachPendingToMessage = vi.fn()

vi.mock('@/lib/a2ui/surface-store', () => ({
  useA2uiSurfaceStore: {
    getState: () => ({
      applyMessages,
      attachPendingToMessage,
    }),
  },
}))

describe('A2UI parse + policy', () => {
  it('parses CUSTOM a2ui array payloads', () => {
    const fixture = loadContextConfirmFixture()
    const event = {
      type: 'CUSTOM',
      name: 'a2ui',
      value: { messages: fixture, messageId: 'ai-1' },
    } as AgUiEvent
    const parsed = parseA2uiCustomEvent(event)
    expect(parsed?.messageId).toBe('ai-1')
    expect(parsed?.messages.length).toBe(3)
  })

  it('parses JSONL string payloads', () => {
    const fixture = loadContextConfirmFixture()
    const jsonl = fixture.map((m) => JSON.stringify(m)).join('\n')
    const event = {
      type: 'CUSTOM',
      name: 'a2ui',
      value: jsonl,
    } as AgUiEvent
    const parsed = parseA2uiCustomEvent(event)
    expect(parsed?.messages).toHaveLength(3)
  })

  it('accepts the context-confirm fixture under policy', () => {
    expect(() => validateA2uiMessages(loadContextConfirmFixture())).not.toThrow()
  })

  it('rejects unknown components', () => {
    expect(() =>
      validateA2uiMessages([
        {
          version: 'v0.9',
          createSurface: {
            surfaceId: 'x',
            catalogId: COS_CATALOG_ID,
          },
        },
        {
          version: 'v0.9',
          updateComponents: {
            surfaceId: 'x',
            components: [{ id: 'root', component: 'EvilWidget' }],
          },
        },
      ])
    ).toThrow(A2uiPolicyError)
  })

  it('formats confirm_context actions', () => {
    const text = formatA2uiActionMessage({
      name: 'confirm_context',
      surfaceId: 'context-confirm',
      sourceComponentId: 'confirm-actions',
      timestamp: new Date().toISOString(),
      context: { missingNote: 'Include addendum', sourceCount: 2 },
    })
    expect(text).toContain('[A2UI:confirm_context]')
    expect(text).toContain('Include addendum')
  })
})

describe('A2UI SSE handler integration', () => {
  const t = ((key: string) => key) as TFunction

  beforeEach(() => {
    applyMessages.mockClear()
    attachPendingToMessage.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('applies a2ui CUSTOM events and rebinds pending on TEXT_MESSAGE_START', () => {
    const aiMessageIdRef = { current: null as string | null }
    const deps = {
      aiMessageIdRef,
      streamContentRef: {
        current: new Map<string, string>(),
      } as MutableRefObject<Map<string, string>>,
      streamRafRef: { current: null as number | null },
      setMessages: vi.fn() as unknown as Dispatch<
        SetStateAction<ChatStreamMessage[]>
      >,
      setStreamStatus: vi.fn() as unknown as Dispatch<SetStateAction<string | null>>,
      setActivityLog: vi.fn() as unknown as Dispatch<SetStateAction<string[]>>,
      setLiveMcpToolCalls: vi.fn() as unknown as Dispatch<
        SetStateAction<ChatToolCall[]>
      >,
      appendStreamingDelta: vi.fn(),
      flushStreamingContent: vi.fn(),
      clearStreamingBuffers: vi.fn(),
      t,
      createAiMessage: (id: string, content: string): ChatStreamMessage => ({
        id,
        type: 'ai',
        content,
      }),
    }

    const handler = createAgUiChatSseHandler(deps, {
      flushOnTextMessageEnd: true,
      clearBuffersOnRunFinished: true,
    })

    const fixture = loadContextConfirmFixture()
    handler({
      type: 'CUSTOM',
      name: 'a2ui',
      value: { messages: fixture },
    } as AgUiEvent)
    expect(applyMessages).toHaveBeenCalledWith(null, fixture)

    handler({
      type: 'TEXT_MESSAGE_START',
      messageId: 'ai-99',
    } as AgUiEvent)
    expect(attachPendingToMessage).toHaveBeenCalledWith('ai-99')
  })
})
