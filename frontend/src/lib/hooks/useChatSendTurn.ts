'use client'

import { useState, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { readAgUiSseStream } from '@/lib/ag-ui/events'
import {
  createAgUiChatSseHandler,
  type AgUiSseHandlerOptions,
  type ChatStreamMessage,
} from '@/lib/hooks/chat-sse-handlers'
import type { ChatStreamingBufferReturn } from '@/lib/hooks/useChatStreamingBuffer'
import {
  createOptimisticUserMessage,
  stripOptimisticMessages,
} from '@/lib/hooks/chat-session-utils'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { QUERY_KEYS } from '@/lib/api/query-client'

export interface UseChatSendTurnOptions<TMessage extends ChatStreamMessage> {
  messages: TMessage[]
  setMessages: Dispatch<SetStateAction<TMessage[]>>
  refetchCurrentSession: () => Promise<unknown>
  queryClient: QueryClient
  streaming: ChatStreamingBufferReturn
  t: TFunction

  /** Auto-create or resolve session id; return null to abort the turn. */
  ensureSession: (message: string) => Promise<string | null>

  buildSendRequest: (params: {
    sessionId: string
    message: string
    modelOverride?: string
    editMessageId?: string
  }) => Promise<ReadableStream<Uint8Array>>

  sseHandlerOptions?: AgUiSseHandlerOptions
  getAbortSignal?: () => AbortSignal | undefined

  /** Project chat: truncate history at editMessageId before optimistic insert. */
  supportsEditResend?: boolean

  beforeSend?: () => void
  /** Called after successful stream (before refetch when refetchAfterTurn is 'success'). */
  afterStreamSuccess?: (sessionId: string) => Promise<void>
  /** Extra finally cleanup (source chat flushes buffers). Receives sessionId when known. */
  onSendFinally?: (sessionId: string | undefined) => void | Promise<void>
  /**
   * After the live turn fully releases (isSending cleared), drain the next
   * queued prompt via the same sendMessage path when provided.
   */
  onTurnComplete?: (sessionId: string) => void | Promise<void>
  /** When 'always', refetch session + MCP tool calls in finally (source chat). Default 'success'. */
  refetchAfterTurn?: 'success' | 'always'
}

/**
 * Shared send-turn orchestration: optimistic user message, SSE handler wiring,
 * error recovery, and optional post-turn queue drain callback.
 */
export function useChatSendTurn<TMessage extends ChatStreamMessage>({
  messages,
  setMessages,
  refetchCurrentSession,
  queryClient,
  streaming,
  t,
  ensureSession,
  buildSendRequest,
  sseHandlerOptions,
  getAbortSignal,
  supportsEditResend = false,
  beforeSend,
  afterStreamSuccess,
  onSendFinally,
  onTurnComplete,
  refetchAfterTurn = 'success',
}: UseChatSendTurnOptions<TMessage>) {
  const [isSending, setIsSending] = useState(false)

  const cancelSending = useCallback(() => {
    setIsSending(false)
  }, [])

  const {
    streamContentRef,
    streamRafRef,
    flushStreamingContent,
    appendStreamingDelta,
    clearStreamingBuffers,
    setStreamStatus,
    setActivityLog,
    setLiveMcpToolCalls,
  } = streaming

  const sendMessage = useCallback(
    async (
      message: string,
      modelOverride?: string,
      editMessageId?: string
    ) => {
      const sessionId = await ensureSession(message)
      if (!sessionId) {
        return
      }

      const userMessage = createOptimisticUserMessage<TMessage>(message)
      if (supportsEditResend && editMessageId) {
        const editIndex = messages.findIndex((msg) => msg.id === editMessageId)
        if (editIndex >= 0) {
          setMessages([...messages.slice(0, editIndex), userMessage])
        } else {
          setMessages((prev) => [...prev, userMessage])
        }
      } else {
        setMessages((prev) => [...prev, userMessage])
      }

      setIsSending(true)
      setStreamStatus(null)
      setActivityLog([])
      setLiveMcpToolCalls([])
      beforeSend?.()

      try {
        const body = await buildSendRequest({
          sessionId,
          message,
          modelOverride,
          editMessageId,
        })

        const aiMessageIdRef = { current: null as string | null }
        const handleAgUiEvent = createAgUiChatSseHandler<TMessage>(
          {
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
            createAiMessage: (id, content) =>
              ({
                id,
                type: 'ai',
                content,
                timestamp: new Date().toISOString(),
              }) as TMessage,
          },
          sseHandlerOptions
        )

        await readAgUiSseStream(body, handleAgUiEvent, getAbortSignal?.())

        await afterStreamSuccess?.(sessionId)
        if (refetchAfterTurn === 'success') {
          await refetchCurrentSession()
          await queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.mcpSessionToolCalls(sessionId),
          })
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const error = err as {
          response?: { data?: { detail?: string } }
          message?: string
        }
        console.error('Error sending message:', error)
        toast.error(
          getApiErrorMessage(
            error.response?.data?.detail || error.message,
            (key) => t(key),
            'apiErrors.failedToSendMessage'
          )
        )
        if (supportsEditResend && editMessageId) {
          await refetchCurrentSession()
        } else {
          setMessages((prev) => stripOptimisticMessages(prev))
        }
      } finally {
        if (refetchAfterTurn === 'always') {
          await refetchCurrentSession()
          if (sessionId) {
            await queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.mcpSessionToolCalls(sessionId),
            })
          }
        }
        await onSendFinally?.(sessionId)
        setIsSending(false)
        setStreamStatus(null)
        setActivityLog([])
        setLiveMcpToolCalls([])
        try {
          await onTurnComplete?.(sessionId)
        } catch (drainError: unknown) {
          console.error('Error draining chat queue after turn:', drainError)
          const error = drainError as {
            response?: { data?: { detail?: string } }
            message?: string
          }
          toast.error(
            getApiErrorMessage(
              error.response?.data?.detail || error.message || error,
              (key) => t(key),
              'apiErrors.failedToSendMessage'
            )
          )
        }
      }
    },
    [
      appendStreamingDelta,
      afterStreamSuccess,
      beforeSend,
      buildSendRequest,
      clearStreamingBuffers,
      ensureSession,
      flushStreamingContent,
      getAbortSignal,
      messages,
      onSendFinally,
      onTurnComplete,
      queryClient,
      refetchCurrentSession,
      setActivityLog,
      setLiveMcpToolCalls,
      setMessages,
      setStreamStatus,
      sseHandlerOptions,
      streamContentRef,
      streamRafRef,
      supportsEditResend,
      t,
      refetchAfterTurn,
    ]
  )

  return { sendMessage, isSending, cancelSending }
}
