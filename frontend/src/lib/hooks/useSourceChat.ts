'use client'

import { useState, useCallback, useRef } from 'react'
import { sourceChatApi } from '@/lib/api/source-chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  CreateSourceChatSessionRequest,
  UpdateSourceChatSessionRequest,
  SourceChatSession,
} from '@/lib/types/api'
import { useChatRuntime } from '@/lib/hooks/useChatRuntime'

export function useSourceChat(sourceId: string) {
  const [contextIndicators, setContextIndicators] =
    useState<SourceChatContextIndicator | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const activeTurnAbortRef = useRef<AbortController | null>(null)

  const sessionsQueryKey = QUERY_KEYS.sourceChatSessions(sourceId)
  const sessionQueryKey = useCallback(
    (sessionId: string) => QUERY_KEYS.sourceChatSession(sourceId, sessionId),
    [sourceId]
  )

  const runtime = useChatRuntime<
    SourceChatSession,
    Omit<CreateSourceChatSessionRequest, 'source_id'>,
    UpdateSourceChatSessionRequest,
    SourceChatMessage
  >({
    dataSource: {
      sessionsQueryKey,
      sessionQueryKey,
      listSessions: () => sourceChatApi.listSessions(sourceId),
      getSession: (sessionId) => sourceChatApi.getSession(sourceId, sessionId),
      enabled: !!sourceId,
    },
    mutations: {
      api: {
        create: (data: Omit<CreateSourceChatSessionRequest, 'source_id'>) =>
          sourceChatApi.createSession(sourceId, data),
        update: (sessionId, data: UpdateSourceChatSessionRequest) =>
          sourceChatApi.updateSession(sourceId, sessionId, data),
        delete: (sessionId) => sourceChatApi.deleteSession(sourceId, sessionId),
      },
    },
    skillSelection: {
      persistSession: (sessionId, data) =>
        sourceChatApi.updateSession(sourceId, sessionId, data),
    },
    ensureSession: {
      logCreateError: true,
      createSessionForMessage: (ctx, title) =>
        sourceChatApi.createSession(sourceId, {
          title,
          skill_ids: ctx.selectedSkillIdsRef.current,
          html_template_id: ctx.selectedHtmlTemplateIdRef.current,
        }),
    },
    buildSendRequest: async (ctx, { sessionId, message, modelOverride }) => {
      const response = await sourceChatApi.sendMessage(
        sourceId,
        sessionId,
        {
          message,
          model_override: modelOverride,
          skill_ids: ctx.selectedSkillIdsRef.current,
          mcp_tool_ids: ctx.selectedMcpToolIdsRef.current,
          html_template_id: ctx.selectedHtmlTemplateIdRef.current,
        },
        abortControllerRef.current?.signal
      )
      if (!response) {
        throw new Error('No response body')
      }
      return response
    },
    sendTurn: {
      refetchAfterTurn: 'always',
      sseHandlerOptions: {
        onStateSnapshot: (snapshot) => {
          const indicators = (snapshot as { context_indicators?: unknown })
            ?.context_indicators
          if (indicators && typeof indicators === 'object') {
            setContextIndicators(indicators as SourceChatContextIndicator)
          }
        },
      },
    },
    sendTurnLifecycle: {
      beforeSend: (streaming) => {
        streaming.clearStreamingBuffers()
        abortControllerRef.current?.abort()
        const abortController = new AbortController()
        abortControllerRef.current = abortController
        activeTurnAbortRef.current = abortController
      },
      getAbortSignal: () => abortControllerRef.current?.signal,
      onSendFinally: (streaming) => {
        streaming.flushStreamingContent()
        streaming.clearStreamingBuffers()
        if (abortControllerRef.current === activeTurnAbortRef.current) {
          abortControllerRef.current = null
        }
        activeTurnAbortRef.current = null
      },
    },
    enqueue: {
      buildEnqueuePayload: (
        ctx,
        { message, modelOverride, loopCount, scheduleRunner }
      ) => ({
        prompt: message,
        loop_count: loopCount,
        schedule_runner: scheduleRunner,
        model_id: modelOverride ?? ctx.currentSession?.model_override ?? undefined,
        skill_ids: ctx.selectedSkillIdsRef.current,
        tool_ids: ctx.selectedMcpToolIdsRef.current,
        html_template_id: ctx.selectedHtmlTemplateIdRef.current,
      }),
    },
    onSwitchSession: () => setContextIndicators(null),
    resolveCurrentSession: (sessions, currentSessionId, currentSession) =>
      sessions.find((session) => session.id === currentSessionId) || currentSession,
  })

  const {
    sessions,
    currentSession,
    currentSessionId,
    loadingSessions,
    refetchSessions,
    liveMcpToolCalls,
    selectedSkillIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    selectedSkillIdsRef,
    selectedHtmlTemplateIdRef,
    setSelectedSkillIds,
    setSelectedHtmlTemplateId,
    setSelectedMcpToolIds,
    mutateCreateSession,
    updateSession,
    deleteSession,
    switchSession: switchSessionBase,
    sendMessage,
    isSending,
    cancelSending,
    enqueueMessage,
    chatQueue,
    queueHasWork,
    presentationView,
    clearPending,
  } = runtime

  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      cancelSending()
    }
  }, [cancelSending])

  const switchSession = useCallback(
    (sessionId: string) => switchSessionBase(sessionId),
    [switchSessionBase]
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
    currentSession,
    currentSessionId,
    messages: presentationView.messages,
    isStreaming: presentationView.isSending,
    isDirectSending: isSending,
    streamStatus: presentationView.streamStatus,
    activityLog: presentationView.activityLog,
    contextIndicators,
    loadingSessions,
    selectedSkillIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    liveMcpToolCalls,
    queue: presentationView.queue,
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
