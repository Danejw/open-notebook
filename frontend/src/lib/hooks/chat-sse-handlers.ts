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
import {
  parseMcpToolCallEvent,
  upsertMcpToolCall,
} from '@/lib/ag-ui/mcp-tool-calls'
import type { ChatToolCall } from '@/lib/types/mcp'

export interface ChatStreamMessage {
  id: string
  type: 'human' | 'ai'
  content: string
  timestamp?: string
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
    onStateSnapshot,
    flushOnTextMessageEnd = false,
    clearBuffersOnRunFinished = false,
  } = options

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
        const toolCallUpdate = parseMcpToolCallEvent(event)
        if (toolCallUpdate) {
          setLiveMcpToolCalls((prev) => upsertMcpToolCall(prev, toolCallUpdate))
        }
        onCustomEvent?.(event)
        break
      }
      case 'TEXT_MESSAGE_START': {
        const messageId = resolveAgUiMessageId(event)
        aiMessageIdRef.current = messageId
        streamContentRef.current.set(messageId, '')
        setMessages((prev) => [...prev, createAiMessage(messageId, '')])
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
