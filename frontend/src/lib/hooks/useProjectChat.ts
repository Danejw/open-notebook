'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  CreateProjectChatSessionRequest,
  UpdateProjectChatSessionRequest,
  SourceListResponse,
  NoteResponse,
  ProjectChatMessage,
} from '@/lib/types/api'
import type { ContextSelections } from '@/lib/types/project-context'
import type { Artifact } from '@/lib/types/artifacts'
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
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { hydrateA2uiFromMessages } from '@/lib/a2ui/hydrate'
import { formatA2uiActionMessage } from '@/lib/a2ui/format-action-message'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'
import { loadAskUserFixture } from '@/lib/a2ui/fixtures/load-ask-user'

interface UseProjectChatParams {
  projectId: string
  sources: SourceListResponse[]
  notes: NoteResponse[]
  contextSelections: ContextSelections
  activeArtifactId?: string | null
  /** Shared-chat guest identity; scopes sessions and API calls. */
  guestKey?: string | null
  /** When true: no skills, tools, model override, or artifacts. */
  sharedMode?: boolean
}

export function useProjectChat({
  projectId,
  sources,
  notes,
  contextSelections,
  activeArtifactId,
  guestKey = null,
  sharedMode = false,
}: UseProjectChatParams) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ProjectChatMessage[]>([])
  const [tokenCount, setTokenCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)
  const [pendingModelOverride, setPendingModelOverride] = useState<string | null>(
    null
  )

  const streaming = useChatStreamingBuffer(setMessages)
  const { streamStatus, activityLog, liveMcpToolCalls } = streaming

  const sessionsQueryKey = QUERY_KEYS.projectChatSessions(projectId, guestKey)
  const sessionQueryKey = useCallback(
    (sessionId: string) => QUERY_KEYS.projectChatSession(sessionId, guestKey),
    [guestKey]
  )

  const {
    data: sessions = [],
    isLoading: loadingSessions,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: () => chatApi.listSessions(projectId, guestKey),
    enabled: !!projectId && (!sharedMode || !!guestKey),
  })

  const { data: currentSession, refetch: refetchCurrentSession } = useQuery({
    queryKey: sessionQueryKey(currentSessionId!),
    queryFn: () => chatApi.getSession(currentSessionId!, guestKey),
    enabled: !!projectId && !!currentSessionId && (!sharedMode || !!guestKey),
  })

  const chatQueue = useChatQueue(sharedMode ? null : currentSessionId, {
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
        queryFn: () => chatApi.getSession(sessionId, guestKey),
      })
    },
    [queryClient, guestKey, sessionQueryKey]
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
    disabled: sharedMode,
    sessionsQueryKey,
    sessionQueryKey,
    persistSession: (sessionId, data) =>
      chatApi.updateSession(sessionId, data, guestKey),
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
    updateSessionMutation,
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
    toastOnCreate: !sharedMode,
    api: {
      create: (data: CreateProjectChatSessionRequest) =>
        chatApi.createSession(
          sharedMode
            ? {
                ...data,
                skill_ids: [],
                model_override: undefined,
                html_template_id: null,
              }
            : data,
          guestKey
        ),
      update: (sessionId, data: UpdateProjectChatSessionRequest) =>
        chatApi.updateSession(sessionId, data, guestKey),
      delete: (sessionId) => chatApi.deleteSession(sessionId, guestKey),
    },
  })

  const applyCreatedSession = useMemo(
    () =>
      applyAutoCreatedSessionSideEffects({
        setCurrentSessionId,
        clearPendingOnSessionCreated,
        invalidateSessionsList: () => {
          void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
        },
        clearPendingModelOverride: () => setPendingModelOverride(null),
      }),
    [clearPendingOnSessionCreated, queryClient, sessionsQueryKey]
  )

  const buildContextConfig = useCallback(() => {
    const context_config: {
      sources: Record<string, string>
      notes: Record<string, string>
    } = {
      sources: {},
      notes: {},
    }

    sources.forEach((source) => {
      const mode = contextSelections.sources[source.id]
      context_config.sources[source.id] =
        mode === 'full' ? 'full content' : 'not in'
    })

    notes.forEach((note) => {
      const mode = contextSelections.notes[note.id]
      context_config.notes[note.id] =
        mode === 'full' ? 'full content' : 'not in'
    })

    return context_config
  }, [sources, notes, contextSelections])

  const buildContext = useCallback(async () => {
    const context_config = buildContextConfig()
    const response = await chatApi.buildContext({
      project_id: projectId,
      context_config,
    })
    setTokenCount(response.token_count)
    setCharCount(response.char_count)
    return response.context
  }, [projectId, buildContextConfig])

  const ensureSession = useCallback(
    async (message: string): Promise<string | null> => {
      try {
        const result = await ensureChatSessionForMessage({
          currentSessionId,
          message,
          createSession: (title) =>
            chatApi.createSession(
              {
                project_id: projectId,
                title,
                model_override: sharedMode
                  ? undefined
                  : (pendingModelOverride ?? undefined),
                skill_ids: sharedMode ? [] : selectedSkillIdsRef.current,
                html_template_id: sharedMode
                  ? null
                  : selectedHtmlTemplateIdRef.current,
                guest_key: guestKey ?? undefined,
              },
              guestKey
            ),
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
      guestKey,
      pendingModelOverride,
      projectId,
      selectedHtmlTemplateIdRef,
      selectedSkillIdsRef,
      sharedMode,
      t,
    ]
  )

  const buildSendRequest = useCallback(
    async ({
      sessionId,
      message,
      modelOverride,
      editMessageId,
    }: {
      sessionId: string
      message: string
      modelOverride?: string
      editMessageId?: string
    }) => {
      const context_config = buildContextConfig()
      void buildContext().catch(() => {})
      return chatApi.sendMessage(
        {
          session_id: sessionId,
          message,
          context_config,
          model_override: sharedMode
            ? undefined
            : (modelOverride ?? currentSession?.model_override ?? undefined),
          skill_ids: sharedMode ? [] : selectedSkillIdsRef.current,
          mcp_tool_ids: sharedMode ? [] : selectedMcpToolIdsRef.current,
          html_template_id: sharedMode ? null : selectedHtmlTemplateIdRef.current,
          edit_message_id: editMessageId,
          artifact_id: sharedMode ? undefined : (activeArtifactId ?? undefined),
        },
        guestKey
      )
    },
    [
      activeArtifactId,
      buildContext,
      buildContextConfig,
      currentSession?.model_override,
      guestKey,
      selectedHtmlTemplateIdRef,
      selectedMcpToolIdsRef,
      selectedSkillIdsRef,
      sharedMode,
    ]
  )

  const { sendMessage, isSending } = useChatSendTurn<ProjectChatMessage>({
    currentSessionId,
    messages,
    setMessages,
    refetchCurrentSession,
    queryClient,
    chatQueue,
    streaming,
    t,
    ensureSession,
    buildSendRequest,
    supportsEditResend: true,
    sseHandlerOptions: {
      flushOnTextMessageEnd: true,
      clearBuffersOnRunFinished: true,
    },
  })

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
      model_id:
        modelOverride ??
        currentSession?.model_override ??
        pendingModelOverride ??
        undefined,
      skill_ids: selectedSkillIdsRef.current,
      tool_ids: selectedMcpToolIdsRef.current,
      html_template_id: selectedHtmlTemplateIdRef.current,
      artifact_id: activeArtifactId ?? undefined,
      context_config: buildContextConfig(),
    }),
    [
      activeArtifactId,
      buildContextConfig,
      currentSession?.model_override,
      pendingModelOverride,
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
    fallbackToSend: sharedMode ? sendMessage : undefined,
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
    (sessionId: string) => switchSessionBase(sessionId, clearPending),
    [clearPending, switchSessionBase]
  )

  const createSession = useCallback(
    (title?: string) => {
      clearPending()
      return mutateCreateSession({
        project_id: projectId,
        title,
        skill_ids: sharedMode ? [] : selectedSkillIdsRef.current,
        html_template_id: sharedMode ? null : selectedHtmlTemplateIdRef.current,
        guest_key: guestKey ?? undefined,
      })
    },
    [
      clearPending,
      guestKey,
      mutateCreateSession,
      projectId,
      selectedHtmlTemplateIdRef,
      selectedSkillIdsRef,
      sharedMode,
    ]
  )

  const setModelOverride = useCallback(
    (model: string | null) => {
      if (sharedMode) {
        return
      }
      if (currentSessionId) {
        updateSessionMutation.mutate({
          sessionId: currentSessionId,
          data: { model_override: model },
        })
      } else {
        setPendingModelOverride(model)
      }
    },
    [currentSessionId, sharedMode, updateSessionMutation]
  )

  const applyArtifactDefaults = useCallback(
    (artifact: Artifact) => {
      if (sharedMode) {
        return
      }

      const artifactSkillIds = artifact.skill_ids ?? []
      if (artifactSkillIds.length > 0) {
        const nextSkills = Array.from(
          new Set([...selectedSkillIdsRef.current, ...artifactSkillIds])
        )
        setSelectedSkillIds(nextSkills)
      }

      const artifactToolIds = artifact.mcp_tool_ids ?? []
      if (artifactToolIds.length > 0) {
        const nextTools = Array.from(
          new Set([...selectedMcpToolIdsRef.current, ...artifactToolIds])
        )
        setSelectedMcpToolIds(nextTools)
      }

      if (artifact.html_template_id) {
        setSelectedHtmlTemplateId(artifact.html_template_id)
      }
    },
    [
      setSelectedHtmlTemplateId,
      setSelectedMcpToolIds,
      setSelectedSkillIds,
      sharedMode,
      selectedMcpToolIdsRef,
      selectedSkillIdsRef,
    ]
  )

  const editAndResend = useCallback(
    async (messageId: string, content: string, modelOverride?: string) => {
      if (!content.trim()) {
        return
      }
      await sendMessage(content.trim(), modelOverride, messageId)
    },
    [sendMessage]
  )

  useEffect(() => {
    if (!isA2uiChatEnabled()) {
      return
    }
    if (currentSession?.messages) {
      hydrateA2uiFromMessages(currentSession.messages)
      return
    }
    if (!currentSessionId) {
      useA2uiSurfaceStore.getState().clearAll()
    }
  }, [currentSession, currentSessionId])

  useEffect(() => {
    if (!isA2uiChatEnabled()) {
      return
    }
    useA2uiSurfaceStore.getState().setActionHandler(async (action) => {
      const text = formatA2uiActionMessage(action)
      await sendMessage(text)
    })
    return () => {
      useA2uiSurfaceStore.getState().setActionHandler(null)
    }
  }, [sendMessage])

  useEffect(() => {
    if (!isA2uiChatEnabled() || typeof window === 'undefined') {
      return
    }
    if (new URLSearchParams(window.location.search).get('a2ui_fixture') !== '1') {
      return
    }
    const fixtureId = 'a2ui-fixture-message'
    setMessages((prev) => {
      if (prev.some((message) => message.id === fixtureId)) {
        return prev
      }
      return [
        ...prev,
        {
          id: fixtureId,
          type: 'ai',
          content: 'A2UI fixture preview (no model).',
          timestamp: new Date().toISOString(),
        },
      ]
    })
    useA2uiSurfaceStore
      .getState()
      .applyMessages(fixtureId, loadAskUserFixture())
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      buildContext().catch((error) => {
        console.error('Error updating context counts:', error)
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [buildContext])

  return {
    sessions,
    currentSession: currentSession || sessions.find((s) => s.id === currentSessionId),
    currentSessionId,
    messages: sharedMode ? messages : queueMessages,
    isSending: sharedMode
      ? isSending
      : isSending || Boolean(queueCurrentItem),
    streamStatus: sharedMode ? streamStatus : queueStreamStatus,
    activityLog: sharedMode ? activityLog : queueActivityLog,
    loadingSessions,
    tokenCount,
    charCount,
    pendingModelOverride,
    selectedSkillIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    liveMcpToolCalls,
    queue: sharedMode ? undefined : chatQueue.queue,
    queueHasWork,
    queueStreamError: chatQueue.streamError,
    isDirectSending: isSending,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    enqueueMessage,
    editAndResend,
    pauseQueue: chatQueue.pause,
    resumeQueue: chatQueue.resume,
    editQueueItem: chatQueue.editItem,
    deleteQueueItem: chatQueue.deleteItem,
    retryQueueItem: chatQueue.retryItem,
    reorderQueue: chatQueue.reorder,
    setModelOverride,
    setSelectedSkillIds,
    setSelectedHtmlTemplateId,
    setSelectedMcpToolIds,
    applyArtifactDefaults,
    refetchSessions,
  }
}
