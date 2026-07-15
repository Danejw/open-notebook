'use client'

import { useState, useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ChatToolCall } from '@/lib/types/mcp'

/**
 * Shared streaming-buffer infrastructure used by both useProjectChat and
 * useSourceChat.  Manages:
 *   - A per-message accumulation map (streamContentRef)
 *   - A requestAnimationFrame coalescing mechanism (streamRafRef)
 *   - Helper callbacks to append deltas and flush them into React state
 *   - Shared transient stream-UI state: streamStatus, activityLog,
 *     liveMcpToolCalls
 *
 * @param setMessages - The React state setter from the caller's useState; used
 *   inside flushStreamingContent to batch-update message content.  The setter
 *   is guaranteed stable by React so including it in dep arrays is safe.
 */
export interface ChatStreamingBufferReturn {
  streamContentRef: MutableRefObject<Map<string, string>>
  streamRafRef: MutableRefObject<number | null>
  flushStreamingContent: () => void
  scheduleStreamingFlush: () => void
  appendStreamingDelta: (messageId: string, delta: string) => void
  clearStreamingBuffers: () => void
  streamStatus: string | null
  setStreamStatus: Dispatch<SetStateAction<string | null>>
  activityLog: string[]
  setActivityLog: Dispatch<SetStateAction<string[]>>
  liveMcpToolCalls: ChatToolCall[]
  setLiveMcpToolCalls: Dispatch<SetStateAction<ChatToolCall[]>>
}

export function useChatStreamingBuffer<
  TMsg extends { id: string; content: string },
>(
  setMessages: Dispatch<SetStateAction<TMsg[]>>
): ChatStreamingBufferReturn {
  const streamContentRef = useRef<Map<string, string>>(new Map())
  const streamRafRef = useRef<number | null>(null)

  const [streamStatus, setStreamStatus] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<string[]>([])
  const [liveMcpToolCalls, setLiveMcpToolCalls] = useState<ChatToolCall[]>([])

  const flushStreamingContent = useCallback(() => {
    streamRafRef.current = null
    const snapshot = new Map(streamContentRef.current)
    if (snapshot.size === 0) return
    setMessages((prev) =>
      prev.map((msg) => {
        const streamed = snapshot.get(msg.id)
        return streamed !== undefined ? { ...msg, content: streamed } : msg
      })
    )
  }, [setMessages])

  const scheduleStreamingFlush = useCallback(() => {
    if (streamRafRef.current != null) return
    streamRafRef.current = requestAnimationFrame(flushStreamingContent)
  }, [flushStreamingContent])

  const appendStreamingDelta = useCallback(
    (messageId: string, delta: string) => {
      const prev = streamContentRef.current.get(messageId) ?? ''
      streamContentRef.current.set(messageId, prev + delta)
      scheduleStreamingFlush()
    },
    [scheduleStreamingFlush]
  )

  const clearStreamingBuffers = useCallback(() => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = null
    }
    streamContentRef.current.clear()
  }, [])

  return {
    streamContentRef,
    streamRafRef,
    flushStreamingContent,
    scheduleStreamingFlush,
    appendStreamingDelta,
    clearStreamingBuffers,
    streamStatus,
    setStreamStatus,
    activityLog,
    setActivityLog,
    liveMcpToolCalls,
    setLiveMcpToolCalls,
  }
}
