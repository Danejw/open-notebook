'use client'

import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sourceChatApi } from '@/lib/api/source-chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  CreateSourceChatSessionRequest,
  UpdateSourceChatSessionRequest,
} from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { toast } from 'sonner'
import { useChatQueue } from '@/lib/hooks/useChatQueue'
import { useChatStreamingBuffer } from '@/lib/hooks/useChatStreamingBuffer'
import { useChatSessionSelection } from '@/lib/hooks/useChatSessionSelection'
import { useChatSessionMutations } from '@/lib/hooks/useChatSessionMutations'
import { useChatSkillSelection } from '@/lib/hooks/useChatSkillSelection'
import { useChatSendTurn } from '@/lib/hooks/useChatSendTurn'
import {
  applyAutoCreatedSessionSideEffects,
  useChatEnqueueMessage,
} from '@/lib/hooks/useChatEnqueueMessage'
import { useChatQueuePresentation } from '@/lib/hooks/useChatQueuePresentation'
import { ensureChatSessionForMessage } from '@/lib/hooks/chat-session-utils'

export function useSourceChat(sourceId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SourceChatMessage[]>([])
  const [contextIndicators, setContextIndicators] =
    useState<SourceChatContextIndicator | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const activeTurnAbortRef = useRef<AbortController | null>(null)

  const streaming = useChatStreamingBuffer(setMessages)
  const {
    streamStatus,
    activityLog,
    liveMcpToolCalls,
    flushStreamingContent,
    clearStreamingBuffers,
  } = streaming

  const sessionsQueryKey = QUERY_KEYS.sourceChatSessions(sourceId)
  const sessionQueryKey = useCallback(
    (sessionId: string) => QUERY_KEYS.sourceChatSession(sourceId, sessionId),
    [sourceId]
  )

  const {
    data: sessions = [],
    isLoading: loadingSessions,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: () => sourceChatApi.listSessions(sourceId),
    enabled: !!sourceId,
  })

  const { data: currentSession, refetch: refetchCurrentSession } = useQuery({
    queryKey: sessionQueryKey(currentSessionId!),
    queryFn: () => sourceChatApi.getSession(sourceId, currentSessionId!),
    enabled: !!sourceId && !!currentSessionId,
  })

  const chatQueue = useChatQueue(currentSessionId, {
    historyQueryKeys: currentSessionId
      ? [sessionQueryKey(currentSessionId)]
      : [],
    onCompletion: () => {
      void refetchCurrentSession()
    },
  })

  const prefetchSession = useCallback(
    (sessionId: string) => {
      void queryClient.prefetchQuery({
        queryKey: sessionQueryKey(sessionId),
        queryFn: () => sourceChatApi.getSession(sourceId, sessionId),
      })
    },
    [queryClient, sessionQueryKey, sourceId]
  )

  useChatSessionSelection({
    sessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    setMessages,
    prefetchSession,
  })

  const skillSelection = useChatSkillSelection({
    currentSessionId,
    currentSession,
    sessionsQueryKey,
    sessionQueryKey,
    persistSession: (sessionId, data) =>
      sourceChatApi.updateSession(sourceId, sessionId, data),
  })

  const {
    selectedSkillIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    selectedSkillIdsRef,
    selectedHtmlTemplateIdRef,
    selectedMcpToolIdsRef,
    setSelectedSkillIds,
    setSelectedHtmlTemplateId,
    setSelectedMcpToolIds,
    clearPending,
    clearPendingOnSessionCreated,
  } = skillSelection

  const {
    createSession: mutateCreateSession,
    updateSession,
    deleteSession,
    switchSession: switchSessionBase,
  } = useChatSessionMutations({
    sessionsQueryKey,
    sessionQueryKey,
    currentSessionId,
    setCurrentSessionId,
    setMessages,
    api: {
      create: (data: Omit<CreateSourceChatSessionRequest, 'source_id'>) =>
        sourceChatApi.createSession(sourceId, data),
      update: (sessionId, data: UpdateSourceChatSessionRequest) =>
        sourceChatApi.updateSession(sourceId, sessionId, data),
      delete: (sessionId) => sourceChatApi.deleteSession(sourceId, sessionId),
    },
  })

  const applyCreatedSession = applyAutoCreatedSessionSideEffects({
    setCurrentSessionId,
    clearPendingOnSessionCreated,
    invalidateSessionsList: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
    },
  })

  const ensureSession = useCallback(
    async (message: string): Promise<string | null> => {
      try {
        const result = await ensureChatSessionForMessage({
          currentSessionId,
          message,
          createSession: (title) =>
            sourceChatApi.createSession(sourceId, {
              title,
              skill_ids: selectedSkillIdsRef.current,
              html_template_id: selectedHtmlTemplateIdRef.current,
            }),
        })
        if (result.created) {
          applyCreatedSession(result.sessionId)
        }
        return result.sessionId
      } catch (err: unknown) {
        const error = err as {
          response?: { data?: { detail?: string } }
          message?: string
        }
        console.error('Failed to create chat session:', error)
        toast.error(
          getApiErrorMessage(
            error.response?.data?.detail || error.message,
            (key) => t(key),
            'apiErrors.failedToCreateSession'
          )
        )
        return null
      }
    },
    [
      applyCreatedSession,
      currentSessionId,
      selectedHtmlTemplateIdRef,
      selectedSkillIdsRef,
      sourceId,
      t,
    ]
  )

  const buildSendRequest = useCallback(
    async ({
      sessionId,
      message,
      modelOverride,
    }: {
      sessionId: string
      message: string
      modelOverride?: string
    }) => {
      const response = await sourceChatApi.sendMessage(
        sourceId,
        sessionId,
        {
          message,
          model_override: modelOverride,
          skill_ids: selectedSkillIdsRef.current,
          mcp_tool_ids: selectedMcpToolIdsRef.current,
          html_template_id: selectedHtmlTemplateIdRef.current,
        },
        abortControllerRef.current?.signal
      )
      if (!response) {
        throw new Error('No response body')
      }
      return response
    },
    [
      selectedHtmlTemplateIdRef,
      selectedMcpToolIdsRef,
      selectedSkillIdsRef,
      sourceId,
    ]
  )

  const { sendMessage, isSending: isStreaming, cancelSending } =
    useChatSendTurn<SourceChatMessage>({
      messages,
      setMessages,
      refetchCurrentSession,
      queryClient,
      chatQueue,
      streaming,
      t,
      ensureSession,
      buildSendRequest,
      refetchAfterTurn: 'always',
      beforeSend: () => {
        clearStreamingBuffers()
        abortControllerRef.current?.abort()
        const abortController = new AbortController()
        abortControllerRef.current = abortController
        activeTurnAbortRef.current = abortController
      },
      getAbortSignal: () => abortControllerRef.current?.signal,
      onSendFinally: () => {
        flushStreamingContent()
        clearStreamingBuffers()
        if (abortControllerRef.current === activeTurnAbortRef.current) {
          abortControllerRef.current = null
        }
        activeTurnAbortRef.current = null
      },
      sseHandlerOptions: {
        onStateSnapshot: (snapshot) => {
          const indicators = (snapshot as { context_indicators?: unknown })
            ?.context_indicators
          if (indicators && typeof indicators === 'object') {
            setContextIndicators(indicators as SourceChatContextIndicator)
          }
        },
      },
    })

  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      cancelSending()
    }
  }, [cancelSending])

  const ensureSessionForEnqueue = useCallback(
    async (message: string): Promise<string> => {
      const sessionId = await ensureSession(message)
      if (!sessionId) {
        throw new Error('Failed to create chat session')
      }
      return sessionId
    },
    [ensureSession]
  )

  const buildEnqueuePayload = useCallback(
    ({
      message,
      modelOverride,
      loopCount,
      scheduleRunner,
    }: {
      message: string
      modelOverride?: string
      loopCount: number
      scheduleRunner?: boolean
    }) => ({
      prompt: message,
      loop_count: loopCount,
      schedule_runner: scheduleRunner,
      model_id: modelOverride ?? currentSession?.model_override ?? undefined,
      skill_ids: selectedSkillIdsRef.current,
      tool_ids: selectedMcpToolIdsRef.current,
      html_template_id: selectedHtmlTemplateIdRef.current,
    }),
    [
      currentSession?.model_override,
      selectedHtmlTemplateIdRef,
      selectedMcpToolIdsRef,
      selectedSkillIdsRef,
    ]
  )

  const { enqueueMessage } = useChatEnqueueMessage({
    currentSessionId,
    chatQueue,
    t,
    ensureSession: ensureSessionForEnqueue,
    buildEnqueuePayload,
  })

  const {
    queueMessages,
    queueCurrentItem,
    queueStreamStatus,
    queueActivityLog,
    queueHasWork,
  } = useChatQueuePresentation({
    messages,
    queue: chatQueue.queue,
    streamStatus,
    activityLog,
    includeFailed: true,
  })

  const switchSession = useCallback(
    (sessionId: string) => {
      switchSessionBase(sessionId, clearPending)
      setContextIndicators(null)
    },
    [clearPending, switchSessionBase]
  )

  const createSession = useCallback(
    (data: Omit<CreateSourceChatSessionRequest, 'source_id'>) => {
      clearPending()
      return mutateCreateSession({
        ...data,
        skill_ids: data.skill_ids ?? selectedSkillIdsRef.current,
        html_template_id:
          data.html_template_id !== undefined
            ? data.html_template_id
            : selectedHtmlTemplateIdRef.current,
      })
    },
    [
      clearPending,
      mutateCreateSession,
      selectedHtmlTemplateIdRef,
      selectedSkillIdsRef,
    ]
  )

  return {
    sessions,
    currentSession:
      sessions.find((s) => s.id === currentSessionId) || currentSession,
    currentSessionId,
    messages: queueMessages,
    isStreaming: isStreaming || Boolean(queueCurrentItem),
    isDirectSending: isStreaming,
    streamStatus: queueStreamStatus,
    activityLog: queueActivityLog,
    contextIndicators,
    loadingSessions,
    selectedSkillIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    liveMcpToolCalls,
    queue: chatQueue.queue,
    queueHasWork,
    queueStreamError: chatQueue.streamError,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    enqueueMessage,
    cancelStreaming,
    pauseQueue: chatQueue.pause,
    resumeQueue: chatQueue.resume,
    editQueueItem: chatQueue.editItem,
    deleteQueueItem: chatQueue.deleteItem,
    retryQueueItem: chatQueue.retryItem,
    reorderQueue: chatQueue.reorder,
    refetchSessions,
    setSelectedSkillIds,
    setSelectedHtmlTemplateId,
    setSelectedMcpToolIds,
  }
}
