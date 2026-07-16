'use client'

import { useEffect, useMemo } from 'react'
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { formatChatContentForDisplay } from '@/lib/a2ui/display-chat-content'
import { parseInlineA2uiFromText } from '@/lib/a2ui/parse-inline-a2ui'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'

/**
 * Client-facing text for a chat row, plus A2UI surface ingestion for AI JSON.
 */
export function useInlineA2uiFromContent(
  messageId: string,
  content: string,
  options?: {
    enabled?: boolean
    isStreaming?: boolean
    role?: 'human' | 'ai'
  }
): string {
  const enabled = options?.enabled ?? isA2uiChatEnabled()
  const isStreaming = options?.isStreaming ?? false
  const role = options?.role ?? 'ai'

  const displayText = useMemo(
    () =>
      formatChatContentForDisplay(content, {
        role,
        messageId,
      }),
    [content, role, messageId]
  )

  const protocolMessages = useMemo(() => {
    if (!enabled || role !== 'ai' || !content) {
      return null
    }
    return parseInlineA2uiFromText(content, { messageId }).messages
  }, [enabled, role, content, messageId])

  useEffect(() => {
    if (!enabled || role !== 'ai' || isStreaming || !protocolMessages?.length) {
      return
    }
    useA2uiSurfaceStore.getState().applyMessages(messageId, protocolMessages)
  }, [enabled, role, isStreaming, messageId, protocolMessages])

  return displayText
}
