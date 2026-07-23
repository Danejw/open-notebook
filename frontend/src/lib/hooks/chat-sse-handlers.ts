import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import {
  agentStepI18nKey,
  type AgUiEvent,
} from '@/lib/ag-ui/events'
import {
  formatAgentProgressLogLine,
  formatAgentProgressStatus,
  parseAgentProgressEvent,
} from '@/lib/ag-ui/progress'
import { parseEvidenceFocusEvent } from '@/lib/ag-ui/evidence-focus'
import { useCitationFocusStore } from '@/lib/stores/citation-focus-store'
import {
  parseMcpToolCallEvent,
  upsertMcpToolCall,
} from '@/lib/ag-ui/mcp-tool-calls'
import { parseA2uiEvent } from '@/lib/ag-ui/a2ui'
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'
import type { ChatToolCall } from '@/lib/types/mcp'
import { attachHtmlToChatContent } from '@/lib/utils/extract-html-from-chat'

export const HTML_TEMPLATE_OUTPUT_EVENT = 'html_template_output'

export interface ChatStreamMessage {
  id: string
  type: 'human' | 'ai'
  content: string
  timestamp?: string
}

export interface ParsedHtmlTemplateOutputEvent {
  messageId: string | null
  templateId: string | null
  html: string
}

export function parseHtmlTemplateOutputEvent(
  event: AgUiEvent
): ParsedHtmlTemplateOutputEvent | null {
  if (event.name !== HTML_TEMPLATE_OUTPUT_EVENT) {
    return null
  }
  const value = event.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (typeof record.html !== 'string' || !record.html.trim()) {
    return null
  }
  return {
    messageId:
      typeof record.messageId === 'string'
        ? record.messageId
        : typeof event.messageId === 'string'
          ? event.messageId
          : null,
    templateId:
      typeof record.templateId === 'string' ? record.templateId : null,
    html: record.html,
  }
}

export interface AgUiSseHandlerDeps<TMessage extends ChatStreamMessage> {
  aiMessageIdRef: MutableRefObject<string | null>
  streamContentRef: MutableRefObject<Map<string, string>>
  streamRafRef: MutableRefObject<number | null>
  setMessages: Dispatch<SetStateAction<TMessage[]>>
  setStreamStatus: Dispatch<SetStateAction<string | null>>
  setActivityLog: Dispatch<SetStateAction<string[]>>
  setLiveMcpToolCalls: Dispatch<SetStateAction<ChatToolCall[]>>
  appendStreamingDelta: (messageId: string, delta: string) => void
  flushStreamingContent: () => void
  clearStreamingBuffers: () => void
  t: TFunction
  createAiMessage: (id: string, content: string) => TMessage
}

export interface AgUiSseHandlerOptions {
  /** Called for CUSTOM events not handled by shared progress/tool-call logic. */
  onCustomEvent?: (event: AgUiEvent) => void
  /** Called when a tool-call audit snapshot is received (native or MCP). */
  onToolCallUpdate?: (toolCall: ChatToolCall) => void
  /** Source chat: apply context indicators from STATE_SNAPSHOT events. */
  onStateSnapshot?: (snapshot: unknown) => void
  /**
   * Project chat flushes on TEXT_MESSAGE_END; source chat omits this case.
   * When false, TEXT_MESSAGE_END is ignored.
   */
  flushOnTextMessageEnd?: boolean
  /**
   * Project chat clears buffers on RUN_FINISHED; source chat only clears status.
   * When false, RUN_FINISHED only resets stream status.
   */
  clearBuffersOnRunFinished?: boolean
}

/** Extract text delta from TEXT_MESSAGE_CONTENT or TEXT_MESSAGE_CHUNK events. */
export function extractAgUiTextDelta(event: AgUiEvent): string {
  if (typeof event.delta === 'string') {
    return event.delta
  }
  if (typeof event.content === 'string') {
    return event.content
  }
  return ''
}

/** Resolve AI message id from an AG-UI event or generate a fallback. */
export function resolveAgUiMessageId(
  event: AgUiEvent,
  fallbackPrefix = 'ai'
): string {
  return (event.messageId as string) || `${fallbackPrefix}-${Date.now()}`
}

/** Extract plain text from an AG-UI message content field. */
export function extractAgUiMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  const parts: string[] = []
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part)
      continue
    }
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      continue
    }
    const record = part as Record<string, unknown>
    if (typeof record.text === 'string') {
      parts.push(record.text)
    }
  }
  return parts.join('')
}

export type AgUiSnapshotAssistantMessage = {
  id: string
  content: string
}

/**
 * Pull assistant messages with non-empty text from a MESSAGES_SNAPSHOT payload.
 */
export function extractAgUiSnapshotAssistantMessages(
  messages: unknown
): AgUiSnapshotAssistantMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }
  const out: AgUiSnapshotAssistantMessage[] = []
  for (const item of messages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const record = item as Record<string, unknown>
    if (record.role !== 'assistant') {
      continue
    }
    const id = typeof record.id === 'string' ? record.id : null
    const content = extractAgUiMessageContent(record.content).trim()
    if (!id || !content) {
      continue
    }
    out.push({ id, content })
  }
  return out
}

/**
 * Factory for the shared AG-UI SSE switch used by project and source chat.
 * Callers pass hook-specific options for TEXT_MESSAGE_END / RUN_FINISHED behavior
 * and optional CUSTOM extensions (e.g. STATE_SNAPSHOT for source chat).
 */
export function createAgUiChatSseHandler<TMessage extends ChatStreamMessage>(
  deps: AgUiSseHandlerDeps<TMessage>,
  options: AgUiSseHandlerOptions = {}
): (event: AgUiEvent) => void {
  const {
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
  } = deps

  const {
    onCustomEvent,
    onToolCallUpdate,
    onStateSnapshot,
    flushOnTextMessageEnd = false,
    clearBuffersOnRunFinished = false,
  } = options

  const upsertAiMessageContent = (messageId: string, content: string) => {
    streamContentRef.current.set(messageId, content)
    setMessages((prev) => {
      let found = false
      const updated = prev.map((message) => {
        if (message.id !== messageId) {
          return message
        }
        found = true
        return { ...message, content }
      })
      return found
        ? updated
        : [...updated, createAiMessage(messageId, content)]
    })
  }

  return (event: AgUiEvent) => {
    switch (event.type) {
      case 'STEP_STARTED': {
        if (typeof event.stepName === 'string') {
          setStreamStatus(t(agentStepI18nKey(event.stepName)))
        }
        break
      }
      case 'STEP_FINISHED': {
        break
      }
      case 'CUSTOM': {
        const progress = parseAgentProgressEvent(event)
        if (progress) {
          const status = formatAgentProgressStatus(progress, t)
          if (status) {
            setStreamStatus(status)
          }
          const logLine = formatAgentProgressLogLine(progress, t)
          if (logLine) {
            setActivityLog((prev) => [...prev, logLine])
          }
        }
        const evidenceFocus = parseEvidenceFocusEvent(event)
        if (evidenceFocus) {
          useCitationFocusStore.getState().setTurnFocus(evidenceFocus.items)
        }
        const toolCallUpdate = parseMcpToolCallEvent(event)
        if (toolCallUpdate) {
          setLiveMcpToolCalls((prev) => upsertMcpToolCall(prev, toolCallUpdate))
          onToolCallUpdate?.(toolCallUpdate)
        }
        if (isA2uiChatEnabled()) {
          const a2ui = parseA2uiEvent(event)
          if (a2ui) {
            const store = useA2uiSurfaceStore.getState()
            const boundMessageId = a2ui.messageId || aiMessageIdRef.current
            store.applyMessages(boundMessageId, a2ui.messages)
          }
        }
        const htmlOutput = parseHtmlTemplateOutputEvent(event)
        if (htmlOutput) {
          const boundMessageId = htmlOutput.messageId || aiMessageIdRef.current
          if (boundMessageId) {
            const currentContent =
              streamContentRef.current.get(boundMessageId) ?? ''
            const nextContent = attachHtmlToChatContent(
              currentContent,
              htmlOutput.html
            )
            upsertAiMessageContent(boundMessageId, nextContent)
          }
        }
        onCustomEvent?.(event)
        break
      }
      case 'TEXT_MESSAGE_START': {
        const messageId = resolveAgUiMessageId(event)
        aiMessageIdRef.current = messageId
        streamContentRef.current.set(messageId, '')
        setMessages((prev) => {
          if (prev.some((message) => message.id === messageId)) {
            return prev
          }
          return [...prev, createAiMessage(messageId, '')]
        })
        if (isA2uiChatEnabled()) {
          useA2uiSurfaceStore.getState().attachPendingToMessage(messageId)
        }
        break
      }
      case 'TEXT_MESSAGE_CONTENT':
      case 'TEXT_MESSAGE_CHUNK': {
        const delta = extractAgUiTextDelta(event)
        if (!delta) {
          break
        }
        if (!aiMessageIdRef.current) {
          const messageId = resolveAgUiMessageId(event)
          aiMessageIdRef.current = messageId
          streamContentRef.current.set(messageId, delta)
          setMessages((prev) => [...prev, createAiMessage(messageId, delta)])
        } else {
          appendStreamingDelta(aiMessageIdRef.current, delta)
        }
        break
      }
      case 'TEXT_MESSAGE_END': {
        if (!flushOnTextMessageEnd) {
          break
        }
        if (streamRafRef.current != null) {
          cancelAnimationFrame(streamRafRef.current)
          streamRafRef.current = null
        }
        flushStreamingContent()
        setStreamStatus(null)
        break
      }
      case 'MESSAGES_SNAPSHOT': {
        const assistants = extractAgUiSnapshotAssistantMessages(event.messages)
        for (const assistant of assistants) {
          aiMessageIdRef.current = assistant.id
          upsertAiMessageContent(assistant.id, assistant.content)
        }
        break
      }
      case 'STATE_SNAPSHOT': {
        onStateSnapshot?.(event.snapshot)
        break
      }
      case 'RUN_FINISHED': {
        if (clearBuffersOnRunFinished) {
          flushStreamingContent()
          clearStreamingBuffers()
        }
        setStreamStatus(null)
        break
      }
      case 'RUN_ERROR': {
        throw new Error(
          typeof event.message === 'string' ? event.message : 'Stream error'
        )
      }
      default:
        break
    }
  }
}
