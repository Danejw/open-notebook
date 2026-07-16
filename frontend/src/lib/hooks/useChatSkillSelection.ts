'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface ChatSessionSkillSnapshot {
  skill_ids?: string[] | null
  collection_ids?: string[] | null
  html_template_id?: string | null
}

export interface UseChatSkillSelectionOptions {
  currentSessionId: string | null
  currentSession: ChatSessionSkillSnapshot | undefined
  /** When true, clears selections and skips persistence (project sharedMode). */
  disabled?: boolean
  sessionsQueryKey: QueryKey
  sessionQueryKey: (sessionId: string) => QueryKey
  persistSession: (
    sessionId: string,
    data: {
      skill_ids?: string[]
      collection_ids?: string[]
      html_template_id?: string | null
    }
  ) => Promise<unknown>
}

/**
 * Shared skill/template/MCP selection state with session restore and persistence.
 * Refs mirror state so send/enqueue in the same tick as applyArtifactDefaults
 * reads the latest values.
 */
export function useChatSkillSelection({
  currentSessionId,
  currentSession,
  disabled = false,
  sessionsQueryKey,
  sessionQueryKey,
  persistSession,
}: UseChatSkillSelectionOptions) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [selectedSkillIds, setSelectedSkillIdsState] = useState<string[]>([])
  const [pendingSkillIds, setPendingSkillIds] = useState<string[] | null>(null)
  const [selectedCollectionIds, setSelectedCollectionIdsState] = useState<string[]>([])
  const [pendingCollectionIds, setPendingCollectionIds] = useState<string[] | null>(null)
  const [selectedHtmlTemplateId, setSelectedHtmlTemplateIdState] = useState<
    string | null
  >(null)
  const [pendingHtmlTemplateId, setPendingHtmlTemplateId] = useState<
    string | null | undefined
  >(undefined)
  const [selectedMcpToolIds, setSelectedMcpToolIdsState] = useState<string[]>(
    []
  )

  const selectedSkillIdsRef = useRef(selectedSkillIds)
  const selectedCollectionIdsRef = useRef(selectedCollectionIds)
  const selectedHtmlTemplateIdRef = useRef(selectedHtmlTemplateId)
  const selectedMcpToolIdsRef = useRef(selectedMcpToolIds)
  selectedSkillIdsRef.current = selectedSkillIds
  selectedCollectionIdsRef.current = selectedCollectionIds
  selectedHtmlTemplateIdRef.current = selectedHtmlTemplateId
  selectedMcpToolIdsRef.current = selectedMcpToolIds

  const clearPending = useCallback(() => {
    setPendingSkillIds(null)
    setPendingCollectionIds(null)
    setPendingHtmlTemplateId(undefined)
  }, [])

  // Restore skill / template selection from the active session (or pending)
  useEffect(() => {
    if (disabled) {
      setSelectedSkillIdsState([])
      setSelectedCollectionIdsState([])
      setSelectedMcpToolIdsState([])
      setSelectedHtmlTemplateIdState(null)
      return
    }
    if (!currentSessionId) {
      setSelectedSkillIdsState(pendingSkillIds ?? [])
      setSelectedCollectionIdsState(pendingCollectionIds ?? [])
      setSelectedHtmlTemplateIdState(
        pendingHtmlTemplateId === undefined ? null : pendingHtmlTemplateId
      )
      return
    }
    if (pendingSkillIds !== null) {
      setPendingSkillIds(null)
    }
    if (pendingCollectionIds !== null) {
      setPendingCollectionIds(null)
    }
    if (pendingHtmlTemplateId !== undefined) {
      setPendingHtmlTemplateId(undefined)
    }
    if (currentSession) {
      setSelectedSkillIdsState(currentSession.skill_ids ?? [])
      setSelectedCollectionIdsState(currentSession.collection_ids ?? [])
      setSelectedHtmlTemplateIdState(currentSession.html_template_id ?? null)
    }
  }, [
    currentSession,
    currentSessionId,
    disabled,
    pendingCollectionIds,
    pendingHtmlTemplateId,
    pendingSkillIds,
  ])

  const persistField = useCallback(
    async (
      sessionId: string,
      data: {
        skill_ids?: string[]
        collection_ids?: string[]
        html_template_id?: string | null
      }
    ) => {
      try {
        await persistSession(sessionId, data)
        void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
        void queryClient.invalidateQueries({
          queryKey: sessionQueryKey(sessionId),
        })
      } catch (err: unknown) {
        const error = err as {
          response?: { data?: { detail?: string } }
          message?: string
        }
        toast.error(
          getApiErrorMessage(
            error.response?.data?.detail || error.message,
            (key) => t(key),
            'apiErrors.failedToUpdateSession'
          )
        )
      }
    },
    [persistSession, queryClient, sessionQueryKey, sessionsQueryKey, t]
  )

  const setSelectedSkillIds = useCallback(
    (ids: string[]) => {
      if (disabled) {
        selectedSkillIdsRef.current = []
        setSelectedSkillIdsState([])
        return
      }
      selectedSkillIdsRef.current = ids
      setSelectedSkillIdsState(ids)
      if (currentSessionId) {
        void persistField(currentSessionId, { skill_ids: ids })
        setPendingSkillIds(null)
      } else {
        setPendingSkillIds(ids)
      }
    },
    [currentSessionId, disabled, persistField]
  )

  const setSelectedCollectionIds = useCallback(
    (ids: string[]) => {
      if (disabled) {
        selectedCollectionIdsRef.current = []
        setSelectedCollectionIdsState([])
        return
      }
      selectedCollectionIdsRef.current = ids
      setSelectedCollectionIdsState(ids)
      if (currentSessionId) {
        void persistField(currentSessionId, { collection_ids: ids })
        setPendingCollectionIds(null)
      } else {
        setPendingCollectionIds(ids)
      }
    },
    [currentSessionId, disabled, persistField]
  )

  const setSelectedHtmlTemplateId = useCallback(
    (id: string | null) => {
      if (disabled) {
        selectedHtmlTemplateIdRef.current = null
        setSelectedHtmlTemplateIdState(null)
        return
      }
      selectedHtmlTemplateIdRef.current = id
      setSelectedHtmlTemplateIdState(id)
      if (currentSessionId) {
        void persistField(currentSessionId, { html_template_id: id })
        setPendingHtmlTemplateId(undefined)
      } else {
        setPendingHtmlTemplateId(id)
      }
    },
    [currentSessionId, disabled, persistField]
  )

  const setSelectedMcpToolIds = useCallback(
    (ids: string[]) => {
      if (disabled) {
        selectedMcpToolIdsRef.current = []
        setSelectedMcpToolIdsState([])
        return
      }
      selectedMcpToolIdsRef.current = ids
      setSelectedMcpToolIdsState(ids)
    },
    [disabled]
  )

  const clearPendingOnSessionCreated = useCallback(() => {
    setPendingSkillIds(null)
    setPendingCollectionIds(null)
    setPendingHtmlTemplateId(undefined)
  }, [])

  return {
    selectedSkillIds,
    selectedCollectionIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    selectedSkillIdsRef,
    selectedCollectionIdsRef,
    selectedHtmlTemplateIdRef,
    selectedMcpToolIdsRef,
    setSelectedSkillIds,
    setSelectedCollectionIds,
    setSelectedHtmlTemplateId,
    setSelectedMcpToolIds,
    clearPending,
    clearPendingOnSessionCreated,
  }
}
