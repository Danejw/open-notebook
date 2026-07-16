'use client'

import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export interface ChatSessionListItem {
  id: string
}

export interface ChatSessionWithMessages<TMessage> {
  messages?: TMessage[]
}

export interface UseChatSessionSelectionParams<
  TSession extends ChatSessionListItem,
  TMessage,
> {
  sessions: TSession[]
  currentSessionId: string | null
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>
  currentSession: ChatSessionWithMessages<TMessage> | undefined
  setMessages: Dispatch<SetStateAction<TMessage[]>>
  /** Prefetch full session payload for the given id (e.g. TanStack prefetchQuery). */
  prefetchSession?: (sessionId: string) => void
}

/**
 * Shared session-selection effects for project and source chat hooks:
 *   - Sync messages when the active session payload changes
 *   - Auto-select the most recent session (API returns desc by created)
 *   - Prefetch the first session in parallel with list resolution
 */
export function useChatSessionSelection<
  TSession extends ChatSessionListItem,
  TMessage,
>({
  sessions,
  currentSessionId,
  setCurrentSessionId,
  currentSession,
  setMessages,
  prefetchSession,
}: UseChatSessionSelectionParams<TSession, TMessage>): void {
  useEffect(() => {
    if (currentSession?.messages) {
      setMessages(currentSession.messages)
    }
  }, [currentSession, setMessages])

  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      const mostRecentSession = sessions[0]
      setCurrentSessionId(mostRecentSession.id)
    }
  }, [sessions, currentSessionId, setCurrentSessionId])

  useEffect(() => {
    const firstSession = sessions[0]
    if (!firstSession || !prefetchSession) {
      return
    }
    prefetchSession(firstSession.id)
  }, [sessions, prefetchSession])
}
