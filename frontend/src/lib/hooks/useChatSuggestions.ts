'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { chatApi } from '@/lib/api/chat'

const UNUSED_STREAK_PAUSE = 3

export interface UseChatSuggestionsParams {
  scope: 'project' | 'source'
  projectId?: string | null
  sourceId?: string | null
  sessionId?: string | null
  messageCount: number
  enabled?: boolean
  guestKey?: string | null
}

interface SessionPauseState {
  unusedStreak: number
  paused: boolean
}

/**
 * LLM chat starter suggestions: fetch once when a session has 0 messages.
 * Pause after 3 sends that did not come from a suggestion click.
 * Pass `enabled: false` (e.g. user collapsed suggestions) to skip the LLM call.
 */
export function useChatSuggestions({
  scope,
  projectId,
  sourceId,
  sessionId,
  messageCount,
  enabled = true,
  guestKey = null,
}: UseChatSuggestionsParams) {
  const sessionKey = sessionId || 'new'
  const pauseBySession = useRef<Record<string, SessionPauseState>>({})
  const lockedSuggestions = useRef<Record<string, string[]>>({})
  const prevSessionKey = useRef(sessionKey)
  const [version, setVersion] = useState(0)

  const bump = useCallback(() => setVersion((n) => n + 1), [])

  // Migrate draft ('new') state onto the real session id after first send creates it
  useEffect(() => {
    const prev = prevSessionKey.current
    if (prev === 'new' && sessionId) {
      if (pauseBySession.current.new) {
        pauseBySession.current[sessionId] = pauseBySession.current.new
        delete pauseBySession.current.new
      }
      if (lockedSuggestions.current.new) {
        lockedSuggestions.current[sessionId] = lockedSuggestions.current.new
        delete lockedSuggestions.current.new
      }
      bump()
    }
    prevSessionKey.current = sessionKey
  }, [sessionId, sessionKey, bump])

  useEffect(() => {
    if (!pauseBySession.current[sessionKey]) {
      pauseBySession.current[sessionKey] = { unusedStreak: 0, paused: false }
      bump()
    }
  }, [sessionKey, bump])

  const paused = pauseBySession.current[sessionKey]?.paused ?? false

  const canFetch =
    enabled &&
    !paused &&
    messageCount === 0 &&
    ((scope === 'project' && !!projectId) || (scope === 'source' && !!sourceId))

  const query = useQuery({
    queryKey: [
      'chat-suggestions',
      scope,
      projectId ?? null,
      sourceId ?? null,
      guestKey ?? 'owner',
    ],
    queryFn: async () => {
      const data = await chatApi.getSuggestions(
        {
          scope,
          project_id: projectId ?? undefined,
          source_id: sourceId ?? undefined,
          count: 4,
        },
        guestKey
      )
      return (data.suggestions ?? []).filter((s) => s.trim()).slice(0, 5)
    },
    enabled: canFetch,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  useEffect(() => {
    if (
      messageCount === 0 &&
      !paused &&
      query.data &&
      query.data.length > 0
    ) {
      lockedSuggestions.current[sessionKey] = query.data
      bump()
    }
  }, [messageCount, paused, query.data, sessionKey, bump])

  const suggestions = lockedSuggestions.current[sessionKey] ?? []

  const recordSuggestionUsed = useCallback(() => {
    pauseBySession.current[sessionKey] = { unusedStreak: 0, paused: false }
    bump()
  }, [sessionKey, bump])

  const recordManualSend = useCallback(() => {
    const current = pauseBySession.current[sessionKey] ?? {
      unusedStreak: 0,
      paused: false,
    }
    if (current.paused) return
    // Only count ignores after suggestions are visible for this session
    if ((lockedSuggestions.current[sessionKey] ?? []).length === 0) return
    const unusedStreak = current.unusedStreak + 1
    pauseBySession.current[sessionKey] = {
      unusedStreak,
      paused: unusedStreak >= UNUSED_STREAK_PAUSE,
    }
    bump()
  }, [sessionKey, bump])

  void version

  const showSuggestions = !paused && suggestions.length > 0

  return {
    suggestions: showSuggestions ? suggestions : [],
    isLoading: canFetch && query.isLoading && suggestions.length === 0,
    paused,
    recordSuggestionUsed,
    recordManualSend,
  }
}
