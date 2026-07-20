import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import type { AgUiEvent } from '@/lib/ag-ui/events'
import type { ChatToolCall } from '@/lib/types/mcp'
import {
  createAgUiChatSseHandler,
  extractAgUiTextDelta,
  parseHtmlTemplateOutputEvent,
  resolveAgUiMessageId,
  type ChatStreamMessage,
} from './chat-sse-handlers'

const t = ((key: string) => key) as TFunction

interface TestMessage extends ChatStreamMessage {
  timestamp: string
}

function makeDeps() {
  const aiMessageIdRef = { current: null as string | null }
  const streamContentRef = {
    current: new Map<string, string>(),
  } as MutableRefObject<Map<string, string>>
  const streamRafRef = { current: null as number | null }
  const setMessages = vi.fn() as unknown as Dispatch<SetStateAction<TestMessage[]>>
  const setStreamStatus = vi.fn() as unknown as Dispatch<SetStateAction<string | null>>
  const setActivityLog = vi.fn() as unknown as Dispatch<SetStateAction<string[]>>
  const setLiveMcpToolCalls = vi.fn() as unknown as Dispatch<
    SetStateAction<ChatToolCall[]>
  >
  const appendStreamingDelta = vi.fn()
  const flushStreamingContent = vi.fn()
  const clearStreamingBuffers = vi.fn()

  const createAiMessage = (id: string, content: string): TestMessage => ({
    id,
    type: 'ai',
    content,
    timestamp: '2026-01-01T00:00:00Z',
  })

  return {
    aiMessageIdRef,
    streamContentRef,
    streamRafRef,
    setMessages,
    setStreamStatus,
    setActivityLog,
    setLiveMcpToolCalls,
    appendStreamingDelta,
    flushStreamingContent,
    clearStreamingBuffers,
    t,
    createAiMessage,
  }
}

describe('extractAgUiTextDelta', () => {
  it('reads delta then content', () => {
    expect(extractAgUiTextDelta({ type: 'TEXT_MESSAGE_CHUNK', delta: 'a' })).toBe('a')
    expect(extractAgUiTextDelta({ type: 'TEXT_MESSAGE_CONTENT', content: 'b' })).toBe('b')
    expect(extractAgUiTextDelta({ type: 'TEXT_MESSAGE_CHUNK' })).toBe('')
  })
})

describe('resolveAgUiMessageId', () => {
  it('uses messageId or generates fallback', () => {
    expect(resolveAgUiMessageId({ type: 'TEXT_MESSAGE_START', messageId: 'm-1' })).toBe('m-1')
    const generated = resolveAgUiMessageId({ type: 'TEXT_MESSAGE_START' })
    expect(generated.startsWith('ai-')).toBe(true)
  })
})

describe('parseHtmlTemplateOutputEvent', () => {
  it('reads the completed HTML document and message binding', () => {
    expect(
      parseHtmlTemplateOutputEvent({
        type: 'CUSTOM',
        name: 'html_template_output',
        value: {
          messageId: 'ai-1',
          templateId: 'html_template:proposal',
          html: '<html><body>Proposal</body></html>',
        },
      })
    ).toEqual({
      messageId: 'ai-1',
      templateId: 'html_template:proposal',
      html: '<html><body>Proposal</body></html>',
    })
  })
})

describe('createAgUiChatSseHandler', () => {
  beforeEach(() => {
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('handles TEXT_MESSAGE_START and streaming chunks', () => {
    const deps = makeDeps()
    const handler = createAgUiChatSseHandler(deps)

    handler({ type: 'TEXT_MESSAGE_START', messageId: 'ai-1' })
    expect(deps.aiMessageIdRef.current).toBe('ai-1')
    expect(deps.streamContentRef.current.get('ai-1')).toBe('')
    expect(vi.mocked(deps.setMessages)).toHaveBeenCalled()

    handler({ type: 'TEXT_MESSAGE_CHUNK', delta: 'Hello' })
    expect(deps.appendStreamingDelta).toHaveBeenCalledWith('ai-1', 'Hello')
  })

  it('creates message on chunk when start was missed', () => {
    const deps = makeDeps()
    const handler = createAgUiChatSseHandler(deps)

    handler({ type: 'TEXT_MESSAGE_CHUNK', messageId: 'ai-2', delta: 'Hi' })
    expect(deps.aiMessageIdRef.current).toBe('ai-2')
    expect(deps.streamContentRef.current.get('ai-2')).toBe('Hi')
    expect(vi.mocked(deps.setMessages)).toHaveBeenCalled()
  })

  it('attaches streamed HTML output to the matching assistant message', () => {
    const deps = makeDeps()
    deps.aiMessageIdRef.current = 'ai-1'
    deps.streamContentRef.current.set('ai-1', 'Grounded response')
    const handler = createAgUiChatSseHandler(deps)

    handler({
      type: 'CUSTOM',
      name: 'html_template_output',
      value: {
        messageId: 'ai-1',
        templateId: 'html_template:proposal',
        html: '<html><body>Completed proposal</body></html>',
      },
    })

    const streamed = deps.streamContentRef.current.get('ai-1')
    expect(streamed).toContain('Grounded response')
    expect(streamed).toContain('```html')
    expect(streamed).toContain('Completed proposal')

    const update = vi.mocked(deps.setMessages).mock.calls[0][0]
    expect(typeof update).toBe('function')
    const updated = (
      update as (messages: TestMessage[]) => TestMessage[]
    )([
      {
        id: 'ai-1',
        type: 'ai',
        content: 'Grounded response',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ])
    expect(updated[0].content).toBe(streamed)
  })

  it('flushes on TEXT_MESSAGE_END when enabled', () => {
    const deps = makeDeps()
    deps.streamRafRef.current = 99
    const handler = createAgUiChatSseHandler(deps, { flushOnTextMessageEnd: true })

    handler({ type: 'TEXT_MESSAGE_END' })
    expect(cancelAnimationFrame).toHaveBeenCalledWith(99)
    expect(deps.flushStreamingContent).toHaveBeenCalled()
    expect(vi.mocked(deps.setStreamStatus)).toHaveBeenCalledWith(null)
  })

  it('clears buffers on RUN_FINISHED when enabled', () => {
    const deps = makeDeps()
    const handler = createAgUiChatSseHandler(deps, { clearBuffersOnRunFinished: true })

    handler({ type: 'RUN_FINISHED' })
    expect(deps.flushStreamingContent).toHaveBeenCalled()
    expect(deps.clearStreamingBuffers).toHaveBeenCalled()
    expect(vi.mocked(deps.setStreamStatus)).toHaveBeenCalledWith(null)
  })

  it('only clears stream status on RUN_FINISHED by default', () => {
    const deps = makeDeps()
    const handler = createAgUiChatSseHandler(deps)

    handler({ type: 'RUN_FINISHED' })
    expect(deps.flushStreamingContent).not.toHaveBeenCalled()
    expect(deps.clearStreamingBuffers).not.toHaveBeenCalled()
    expect(vi.mocked(deps.setStreamStatus)).toHaveBeenCalledWith(null)
  })

  it('throws on RUN_ERROR', () => {
    const deps = makeDeps()
    const handler = createAgUiChatSseHandler(deps)

    expect(() =>
      handler({ type: 'RUN_ERROR', message: 'boom' } as AgUiEvent)
    ).toThrow('boom')
  })

  it('invokes onCustomEvent for CUSTOM payloads', () => {
    const deps = makeDeps()
    const onCustomEvent = vi.fn()
    const handler = createAgUiChatSseHandler(deps, { onCustomEvent })

    const event = { type: 'CUSTOM', name: 'state_snapshot' } as AgUiEvent
    handler(event)
    expect(onCustomEvent).toHaveBeenCalledWith(event)
  })
})
