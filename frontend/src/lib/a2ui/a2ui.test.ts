import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseA2uiCustomEvent } from '@/lib/a2ui/parse-a2ui-event'
import { validateA2uiMessages, A2uiPolicyError } from '@/lib/a2ui/policy'
import { loadAskUserFixture } from '@/lib/a2ui/fixtures/load-ask-user'
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
    const fixture = loadAskUserFixture()
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
    const fixture = loadAskUserFixture()
    const jsonl = fixture.map((m) => JSON.stringify(m)).join('\n')
    const event = {
      type: 'CUSTOM',
      name: 'a2ui',
      value: jsonl,
    } as AgUiEvent
    const parsed = parseA2uiCustomEvent(event)
    expect(parsed?.messages).toHaveLength(3)
  })

  it('accepts the AskUser fixture under policy', () => {
    expect(() => validateA2uiMessages(loadAskUserFixture())).not.toThrow()
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

  it('rejects removed SourceChipList under policy', () => {
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
            components: [
              { id: 'root', component: 'SourceChipList', sources: [] },
            ],
          },
        },
      ])
    ).toThrow(A2uiPolicyError)
  })

  it('hides A2UI wire tags from client-facing human messages', async () => {
    const { formatChatContentForDisplay } = await import(
      '@/lib/a2ui/display-chat-content'
    )
    const wire =
      '[A2UI:ask_user_answer] User answered a clarifying question. Question: What would you like to focus on for the Gen Korean BBQ Kona project? Answer: Find scope gaps / exclusions Option id: gaps. Continue with this clarification in mind.'
    const display = formatChatContentForDisplay(wire, { role: 'human' })
    expect(display).toBe('Find scope gaps / exclusions')
    expect(display).not.toContain('[A2UI:')
    expect(display).not.toContain('Option id')
  })

  it('hides inline component JSON from client-facing AI messages', async () => {
    const { formatChatContentForDisplay } = await import(
      '@/lib/a2ui/display-chat-content'
    )
    const content = `{
  "component": "AskUser",
  "id": "root",
  "props": {
    "question": "What would you like to focus on?",
    "options": [{ "id": "gaps", "label": "Find scope gaps / exclusions" }]
  }
} Pick a direction and I'll help.`
    const display = formatChatContentForDisplay(content, {
      role: 'ai',
      messageId: 'ai-1',
    })
    expect(display).toContain('Pick a direction')
    expect(display).not.toContain('"component"')
    expect(display).not.toContain('{')
  })

  it('hides leaked a2ui.createSurface() calls from client-facing AI text', async () => {
    const { formatChatContentForDisplay } = await import(
      '@/lib/a2ui/display-chat-content'
    )
    const content =
      'a2ui.createSurface() What should we dig into next? I can help build a scope matrix.'
    const display = formatChatContentForDisplay(content, { role: 'ai' })
    expect(display).toBe(
      'What should we dig into next? I can help build a scope matrix.'
    )
    expect(display.toLowerCase()).not.toContain('createsurface')
    expect(display.toLowerCase()).not.toContain('a2ui.')
  })

  it('formats ask_user_answer actions', () => {
    const text = formatA2uiActionMessage({
      name: 'ask_user_answer',
      surfaceId: 'ask-user-1',
      sourceComponentId: 'ask-user',
      timestamp: new Date().toISOString(),
      context: {
        question: 'Which drawing governs?',
        answer: 'Electrical plans',
        optionId: 'elec',
        optionLabel: 'Electrical plans',
        customText: '',
      },
    })
    expect(text).toContain('[A2UI:ask_user_answer]')
    expect(text).toContain('Which drawing governs?')
    expect(text).toContain('Electrical plans')
  })

  it('parses inline AskUser shorthand mixed with prose', async () => {
    const { parseInlineA2uiFromText } = await import('@/lib/a2ui/parse-inline-a2ui')
    const content = `{
  "component": "AskUser",
  "id": "root",
  "props": {
    "question": "What would you like to focus on?",
    "options": [
      { "id": "scope", "label": "Summarize trade scopes", "recommended": true },
      { "id": "gaps", "label": "Find scope gaps / exclusions" }
    ],
    "customValue": ""
  }
} Pick a direction and I'll help.`
    const parsed = parseInlineA2uiFromText(content, { messageId: 'ai-inline-1' })
    expect(parsed.displayText).toContain('Pick a direction')
    expect(parsed.displayText).not.toContain('"component"')
    expect(parsed.messages).not.toBeNull()
    expect(() => validateA2uiMessages(parsed.messages!)).not.toThrow()
    const comps = parsed.messages!.flatMap(
      (m) => m.updateComponents?.components ?? []
    )
    expect(comps.some((c) => c.component === 'AskUser')).toBe(true)
    expect(comps.some((c) => c.id === 'root')).toBe(true)
  })

  it('parses nested Basic + AskUser trees', async () => {
    const { parseInlineA2uiFromText } = await import('@/lib/a2ui/parse-inline-a2ui')
    const content = JSON.stringify({
      component: 'Column',
      id: 'root',
      children: [
        {
          component: 'Text',
          id: 'title',
          props: { text: 'Choose a path' },
        },
        {
          component: 'AskUser',
          id: 'ask',
          props: {
            question: 'Proceed?',
            options: [{ id: 'yes', label: 'Yes', recommended: true }],
            customValue: '',
            selectedOptionId: '',
          },
        },
      ],
    })
    const parsed = parseInlineA2uiFromText(content, { messageId: 'ai-tree' })
    expect(parsed.messages).not.toBeNull()
    expect(() => validateA2uiMessages(parsed.messages!)).not.toThrow()
    const names = parsed.messages!.flatMap(
      (m) => m.updateComponents?.components?.map((c) => c.component) ?? []
    )
    expect(names).toEqual(expect.arrayContaining(['Column', 'Text', 'AskUser']))
    expect(names).not.toContain('SourceChipList')
  })

  it('parses fenced full protocol payloads', async () => {
    const { parseInlineA2uiFromText } = await import('@/lib/a2ui/parse-inline-a2ui')
    const fixture = loadAskUserFixture()
    const content = `Here you go:\n\`\`\`json\n${JSON.stringify(fixture)}\n\`\`\`\nThanks.`
    const parsed = parseInlineA2uiFromText(content, { messageId: 'ai-proto' })
    expect(parsed.displayText).toContain('Here you go')
    expect(parsed.displayText).toContain('Thanks')
    expect(parsed.displayText).not.toContain('createSurface')
    expect(parsed.messages).toHaveLength(fixture.length)
    expect(() => validateA2uiMessages(parsed.messages!)).not.toThrow()
  })

  it('rejects unknown components via catalog allowlist', async () => {
    const { parseInlineA2uiFromText } = await import('@/lib/a2ui/parse-inline-a2ui')
    const parsed = parseInlineA2uiFromText(
      JSON.stringify({ component: 'NotARealWidget', id: 'root', props: {} }),
      { messageId: 'ai-bad' }
    )
    expect(parsed.messages).toBeNull()
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

    const fixture = loadAskUserFixture()
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
