'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { chatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { readAgUiSseStream } from '@/lib/ag-ui/events'
import { createAgUiChatSseHandler } from '@/lib/hooks/chat-sse-handlers'
import {
  deriveQueueActivityLog,
  deriveQueueHasWork,
  deriveQueueStreamStatus,
  getQueueCurrentItem,
} from '@/lib/hooks/chat-queue-status'
import { useChatSessionSelection } from '@/lib/hooks/useChatSessionSelection'
import {
  ProjectChatMessage,
  CreateProjectChatSessionRequest,
  UpdateProjectChatSessionRequest,
  SourceListResponse,
  NoteResponse
} from '@/lib/types/api'
import type { ContextSelections } from '@/lib/types/project-context'
import { useChatQueue } from '@/lib/hooks/useChatQueue'
import { useChatStreamingBuffer } from '@/lib/hooks/useChatStreamingBuffer'
import { mergeActiveQueueMessages } from '@/lib/utils/chat-queue-messages'
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { hydrateA2uiFromMessages } from '@/lib/a2ui/hydrate'
import { formatA2uiActionMessage } from '@/lib/a2ui/format-action-message'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'
import { loadContextConfirmFixture } from '@/lib/a2ui/fixtures/load-context-confirm'
import { agentDebugLog } from '@/lib/a2ui/agent-debug-log'

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
  const [isSending, setIsSending] = useState(false)
  const [tokenCount, setTokenCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)
  // Pending model override for when user changes model before a session exists
  const [pendingModelOverride, setPendingModelOverride] = useState<string | null>(null)
  const [selectedSkillIds, setSelectedSkillIdsState] = useState<string[]>([])
  const [pendingSkillIds, setPendingSkillIds] = useState<string[] | null>(null)
  const [selectedHtmlTemplateId, setSelectedHtmlTemplateIdState] = useState<string | null>(null)
  const [pendingHtmlTemplateId, setPendingHtmlTemplateId] = useState<string | null | undefined>(undefined)
  const [selectedMcpToolIds, setSelectedMcpToolIdsState] = useState<string[]>([])
  const {
    streamContentRef,
    streamRafRef,
    flushStreamingContent,
    appendStreamingDelta,
    clearStreamingBuffers,
    streamStatus,
    setStreamStatus,
    activityLog,
    setActivityLog,
    liveMcpToolCalls,
    setLiveMcpToolCalls,
  } = useChatStreamingBuffer(setMessages)

  const sessionsQueryKey = QUERY_KEYS.projectChatSessions(projectId, guestKey)
  const sessionQueryKey = useCallback(
    (sessionId: string) =>
      QUERY_KEYS.projectChatSession(sessionId, guestKey),
    [guestKey]
  )

  // Fetch sessions for this project
  const {
    data: sessions = [],
    isLoading: loadingSessions,
    refetch: refetchSessions
  } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: () => chatApi.listSessions(projectId, guestKey),
    enabled: !!projectId && (!sharedMode || !!guestKey),
  })

  // Fetch current session with messages
  const {
    data: currentSession,
    refetch: refetchCurrentSession
  } = useQuery({
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

  // Restore skill / template selection from the active session (or pending)
  useEffect(() => {
    if (sharedMode) {
      setSelectedSkillIdsState([])
      setSelectedMcpToolIdsState([])
      setSelectedHtmlTemplateIdState(null)
      return
    }
    if (!currentSessionId) {
      setSelectedSkillIdsState(pendingSkillIds ?? [])
      setSelectedHtmlTemplateIdState(
        pendingHtmlTemplateId === undefined ? null : pendingHtmlTemplateId
      )
      return
    }
    // Active session owns selection; pending was only for pre-session picks
    if (pendingSkillIds !== null) {
      setPendingSkillIds(null)
    }
    if (pendingHtmlTemplateId !== undefined) {
      setPendingHtmlTemplateId(undefined)
    }
    if (currentSession) {
      setSelectedSkillIdsState(currentSession.skill_ids ?? [])
      setSelectedHtmlTemplateIdState(currentSession.html_template_id ?? null)
    }
  }, [currentSession, currentSessionId, pendingSkillIds, pendingHtmlTemplateId, sharedMode])

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (data: CreateProjectChatSessionRequest) =>
      chatApi.createSession(
        sharedMode
          ? { ...data, skill_ids: [], model_override: undefined, html_template_id: null }
          : data,
        guestKey
      ),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({
        queryKey: sessionsQueryKey,
      })
      setCurrentSessionId(newSession.id)
      if (!sharedMode) {
        toast.success(t('chat.sessionCreated'))
      }
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToCreateSession'))
    }
  })

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, data }: {
      sessionId: string
      data: UpdateProjectChatSessionRequest
    }) => chatApi.updateSession(sessionId, data, guestKey),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sessionsQueryKey,
      })
      queryClient.invalidateQueries({
        queryKey: sessionQueryKey(currentSessionId!),
      })
      toast.success(t('chat.sessionUpdated'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToUpdateSession'))
    }
  })

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      chatApi.deleteSession(sessionId, guestKey),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({
        queryKey: sessionsQueryKey,
      })
      if (currentSessionId === deletedId) {
        setCurrentSessionId(null)
        setMessages([])
      }
      toast.success(t('chat.sessionDeleted'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToDeleteSession'))
    }
  })

  // Build context from sources and notes based on user selections
  const buildContextConfig = useCallback(() => {
    const context_config: { sources: Record<string, string>, notes: Record<string, string> } = {
      sources: {},
      notes: {}
    }

    sources.forEach(source => {
      const mode = contextSelections.sources[source.id]
      if (mode === 'insights') {
        context_config.sources[source.id] = 'insights'
      } else if (mode === 'full') {
        context_config.sources[source.id] = 'full content'
      } else {
        context_config.sources[source.id] = 'not in'
      }
    })

    notes.forEach(note => {
      const mode = contextSelections.notes[note.id]
      if (mode === 'full') {
        context_config.notes[note.id] = 'full content'
      } else {
        context_config.notes[note.id] = 'not in'
      }
    })

    return context_config
  }, [sources, notes, contextSelections])

  // Build context from sources and notes based on user selections (token counts for UI)
  const buildContext = useCallback(async () => {
    const context_config = buildContextConfig()

    const response = await chatApi.buildContext({
      project_id: projectId,
      context_config
    })

    setTokenCount(response.token_count)
    setCharCount(response.char_count)

    return response.context
  }, [projectId, buildContextConfig])

  // Send message (synchronous, no streaming)
  const sendMessage = useCallback(async (
    message: string,
    modelOverride?: string,
    editMessageId?: string,
  ) => {
    let sessionId = currentSessionId

    // Auto-create session if none exists
    if (!sessionId) {
      try {
        const defaultTitle = message.length > 30
          ? `${message.substring(0, 30)}...`
          : message
        const newSession = await chatApi.createSession({
          project_id: projectId,
          title: defaultTitle,
          model_override: sharedMode ? undefined : (pendingModelOverride ?? undefined),
          skill_ids: sharedMode ? [] : selectedSkillIds,
          html_template_id: sharedMode ? null : selectedHtmlTemplateId,
          guest_key: guestKey ?? undefined,
        }, guestKey)
        sessionId = newSession.id
        setCurrentSessionId(sessionId)
        // Clear pending overrides now that they're applied to the session
        setPendingModelOverride(null)
        setPendingSkillIds(null)
        setPendingHtmlTemplateId(undefined)
        queryClient.invalidateQueries({
          queryKey: sessionsQueryKey,
        })
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } }, message?: string };
        toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToCreateSession'))
        return
      }
    }

    // Add user message optimistically
    const userMessage: ProjectChatMessage = {
      id: `temp-${Date.now()}`,
      type: 'human',
      content: message,
      timestamp: new Date().toISOString()
    }

    if (editMessageId) {
      const editIndex = messages.findIndex((msg) => msg.id === editMessageId)
      if (editIndex >= 0) {
        setMessages([...messages.slice(0, editIndex), userMessage])
      } else {
        setMessages((prev) => [...prev, userMessage])
      }
    } else {
      setMessages(prev => [...prev, userMessage])
    }
    setIsSending(true)
    setStreamStatus(null)
    setActivityLog([])
    setLiveMcpToolCalls([])

    try {
      // Pass context_config so the graph streams retrieving_context as an AG-UI step.
      // Refresh token counts in the background without blocking the stream.
      const context_config = buildContextConfig()
      void buildContext().catch(() => {})
      const body = await chatApi.sendMessage({
        session_id: sessionId,
        message,
        context_config,
        model_override: sharedMode
          ? undefined
          : (modelOverride ?? (currentSession?.model_override ?? undefined)),
        skill_ids: sharedMode ? [] : selectedSkillIds,
        mcp_tool_ids: sharedMode ? [] : selectedMcpToolIds,
        html_template_id: sharedMode ? null : selectedHtmlTemplateId,
        edit_message_id: editMessageId,
        artifact_id: sharedMode ? undefined : (activeArtifactId ?? undefined),
      }, guestKey)

      const aiMessageIdRef = { current: null as string | null }
      const handleAgUiEvent = createAgUiChatSseHandler<ProjectChatMessage>(
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
          createAiMessage: (id, content) => ({
            id,
            type: 'ai',
            content,
            timestamp: new Date().toISOString(),
          }),
        },
        {
          flushOnTextMessageEnd: true,
          clearBuffersOnRunFinished: true,
        }
      )

      await readAgUiSseStream(body, handleAgUiEvent)

      // Refetch current session to get updated data
      await refetchCurrentSession()
      if (sessionId) {
        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.mcpSessionToolCalls(sessionId),
        })
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      console.error('Error sending message:', error)
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToSendMessage'))
      if (editMessageId) {
        await refetchCurrentSession()
      } else {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(msg => !msg.id.startsWith('temp-')))
      }
    } finally {
      setIsSending(false)
      setStreamStatus(null)
      setActivityLog([])
      setLiveMcpToolCalls([])
      // Start deferred queue items now that the live turn released the session.
      try {
        await chatQueue.ensureRunner()
      } catch (ensureError) {
        console.error('Error ensuring chat queue runner:', ensureError)
      }
    }
  }, [
    projectId,
    currentSessionId,
    currentSession,
    pendingModelOverride,
    selectedSkillIds,
    selectedMcpToolIds,
    selectedHtmlTemplateId,
    activeArtifactId,
    messages,
    buildContext,
    buildContextConfig,
    appendStreamingDelta,
    clearStreamingBuffers,
    flushStreamingContent,
    refetchCurrentSession,
    queryClient,
    chatQueue,
    t,
    guestKey,
    sharedMode,
    sessionsQueryKey,
    setActivityLog,
    setLiveMcpToolCalls,
    setStreamStatus,
    streamContentRef,
    streamRafRef,
  ])

  // Hydrate A2UI surfaces when session history loads / switches.
  useEffect(() => {
    // #region agent log
    agentDebugLog({
      hypothesisId: 'C',
      location: 'useProjectChat.ts:hydrate-effect',
      message: 'hydrate effect fired',
      data: {
        enabled: isA2uiChatEnabled(),
        sessionId: currentSessionId,
        messageCount: currentSession?.messages?.length ?? null,
        hasFixtureInSession: Boolean(
          currentSession?.messages?.some((m) => m.id === 'a2ui-fixture-message')
        ),
        storeSurfacesBefore: useA2uiSurfaceStore
          .getState()
          .getSurfaceIdsForMessage('a2ui-fixture-message'),
      },
    })
    // #endregion
    if (!isA2uiChatEnabled()) {
      return
    }
    if (currentSession?.messages) {
      hydrateA2uiFromMessages(currentSession.messages)
      // #region agent log
      agentDebugLog({
        hypothesisId: 'C',
        location: 'useProjectChat.ts:hydrate-after',
        message: 'hydrated from session (may wipe fixture)',
        data: {
          storeSurfacesAfter: useA2uiSurfaceStore
            .getState()
            .getSurfaceIdsForMessage('a2ui-fixture-message'),
          revision: useA2uiSurfaceStore.getState().revision,
        },
      })
      // #endregion
      return
    }
    if (!currentSessionId) {
      useA2uiSurfaceStore.getState().clearAll()
    }
  }, [currentSession, currentSessionId])

  // Route A2UI confirm/refine actions back through the normal chat send path.
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

  // Dev fixture: ?a2ui_fixture=1 injects a recorded surface without the agent.
  useEffect(() => {
    const enabled = isA2uiChatEnabled()
    const search =
      typeof window !== 'undefined' ? window.location.search : '(ssr)'
    const fixtureParam =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('a2ui_fixture')
        : null
    // #region agent log
    agentDebugLog({
      hypothesisId: 'A',
      location: 'useProjectChat.ts:fixture-effect',
      message: 'fixture effect entry',
      data: {
        enabled,
        envRaw: process.env.NEXT_PUBLIC_A2UI_CHAT ?? null,
        search,
        fixtureParam,
      },
    })
    // #endregion
    if (!enabled || typeof window === 'undefined') {
      return
    }
    if (fixtureParam !== '1') {
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
    const applyResult = useA2uiSurfaceStore
      .getState()
      .applyMessages(fixtureId, loadContextConfirmFixture())
    // #region agent log
    agentDebugLog({
      hypothesisId: 'B',
      location: 'useProjectChat.ts:fixture-applied',
      message: 'fixture applyMessages result',
      data: {
        applyResult,
        surfaceIds: useA2uiSurfaceStore
          .getState()
          .getSurfaceIdsForMessage(fixtureId),
        error: useA2uiSurfaceStore.getState().getErrorForMessage(fixtureId),
      },
    })
    // #endregion
  }, [])

  const editAndResend = useCallback(async (messageId: string, content: string, modelOverride?: string) => {
    if (!content.trim()) {
      return
    }
    await sendMessage(content.trim(), modelOverride, messageId)
  }, [sendMessage])

  const enqueueMessage = useCallback(
    async (
      message: string,
      options: {
        modelOverride?: string
        loopCount: number
        scheduleRunner?: boolean
      }
    ) => {
      if (sharedMode) {
        await sendMessage(message, options.modelOverride)
        return
      }

      try {
        let sessionId = currentSessionId
        if (!sessionId) {
          const defaultTitle =
            message.length > 30 ? `${message.substring(0, 30)}...` : message
          const newSession = await chatApi.createSession({
            project_id: projectId,
            title: defaultTitle,
            model_override: pendingModelOverride ?? undefined,
            skill_ids: selectedSkillIds,
            html_template_id: selectedHtmlTemplateId,
          })
          sessionId = newSession.id
          setCurrentSessionId(sessionId)
          setPendingModelOverride(null)
          setPendingSkillIds(null)
          setPendingHtmlTemplateId(undefined)
          await queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
        }

        await chatQueue.enqueueForSession(sessionId, {
          prompt: message,
          loop_count: options.loopCount,
          schedule_runner: options.scheduleRunner,
          model_id:
            options.modelOverride ??
            currentSession?.model_override ??
            pendingModelOverride ??
            undefined,
          skill_ids: selectedSkillIds,
          tool_ids: selectedMcpToolIds,
          html_template_id: selectedHtmlTemplateId,
          artifact_id: activeArtifactId ?? undefined,
          context_config: buildContextConfig(),
        })
      } catch (err: unknown) {
        const error = err as {
          response?: { data?: { detail?: string } }
          message?: string
        }
        console.error('Error enqueueing message:', error)
        toast.error(
          getApiErrorMessage(
            error.response?.data?.detail || error.message || error,
            (key) => t(key),
            'apiErrors.failedToSendMessage'
          )
        )
        throw err
      }
    },
    [
      activeArtifactId,
      buildContextConfig,
      chatQueue,
      currentSession?.model_override,
      currentSessionId,
      pendingModelOverride,
      projectId,
      queryClient,
      selectedHtmlTemplateId,
      selectedMcpToolIds,
      selectedSkillIds,
      sendMessage,
      sessionsQueryKey,
      sharedMode,
      t,
    ]
  )

  const queueMessages = useMemo(
    () => mergeActiveQueueMessages(messages, chatQueue.queue),
    [chatQueue.queue, messages]
  )
  const queueCurrentItem = getQueueCurrentItem(chatQueue.queue)
  const queueHasWork = deriveQueueHasWork(chatQueue.queue, { includeFailed: true })
  const queueStreamStatus = deriveQueueStreamStatus(queueCurrentItem, streamStatus)
  const queueActivityLog = deriveQueueActivityLog(queueCurrentItem, activityLog)

  // Switch session
  const switchSession = useCallback((sessionId: string) => {
    setPendingSkillIds(null)
    setPendingHtmlTemplateId(undefined)
    setCurrentSessionId(sessionId)
  }, [])

  // Create session
  const createSession = useCallback((title?: string) => {
    setPendingSkillIds(null)
    setPendingHtmlTemplateId(undefined)
    return createSessionMutation.mutate({
      project_id: projectId,
      title,
      skill_ids: sharedMode ? [] : selectedSkillIds,
      html_template_id: sharedMode ? null : selectedHtmlTemplateId,
      guest_key: guestKey ?? undefined,
    })
  }, [createSessionMutation, projectId, selectedSkillIds, selectedHtmlTemplateId, sharedMode, guestKey])

  // Update session
  const updateSession = useCallback((sessionId: string, data: UpdateProjectChatSessionRequest) => {
    return updateSessionMutation.mutate({
      sessionId,
      data
    })
  }, [updateSessionMutation])

  // Delete session
  const deleteSession = useCallback((sessionId: string) => {
    return deleteSessionMutation.mutate(sessionId)
  }, [deleteSessionMutation])

  // Set model override - handles both existing sessions and pending state
  const setModelOverride = useCallback((model: string | null) => {
    if (sharedMode) {
      return
    }
    if (currentSessionId) {
      // Session exists - update it directly
      updateSessionMutation.mutate({
        sessionId: currentSessionId,
        data: { model_override: model }
      })
    } else {
      // No session yet - store as pending
      setPendingModelOverride(model)
    }
  }, [currentSessionId, sharedMode, updateSessionMutation])

  // Persist skill selection on the session so it survives across messages
  const setSelectedSkillIds = useCallback((ids: string[]) => {
    if (sharedMode) {
      setSelectedSkillIdsState([])
      return
    }
    setSelectedSkillIdsState(ids)
    if (currentSessionId) {
      void (async () => {
        try {
          await chatApi.updateSession(currentSessionId, { skill_ids: ids }, guestKey)
          queryClient.invalidateQueries({
            queryKey: sessionsQueryKey,
          })
          queryClient.invalidateQueries({
            queryKey: sessionQueryKey(currentSessionId),
          })
        } catch (err: unknown) {
          const error = err as { response?: { data?: { detail?: string } }, message?: string }
          toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToUpdateSession'))
        }
      })()
      setPendingSkillIds(null)
    } else {
      setPendingSkillIds(ids)
    }
  }, [
    currentSessionId,
    guestKey,
    queryClient,
    sessionQueryKey,
    sessionsQueryKey,
    sharedMode,
    t,
  ])

  const setSelectedHtmlTemplateId = useCallback((id: string | null) => {
    if (sharedMode) {
      setSelectedHtmlTemplateIdState(null)
      return
    }
    setSelectedHtmlTemplateIdState(id)
    if (currentSessionId) {
      void (async () => {
        try {
          await chatApi.updateSession(
            currentSessionId,
            { html_template_id: id },
            guestKey
          )
          queryClient.invalidateQueries({
            queryKey: sessionsQueryKey,
          })
          queryClient.invalidateQueries({
            queryKey: sessionQueryKey(currentSessionId),
          })
        } catch (err: unknown) {
          const error = err as { response?: { data?: { detail?: string } }, message?: string }
          toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToUpdateSession'))
        }
      })()
      setPendingHtmlTemplateId(undefined)
    } else {
      setPendingHtmlTemplateId(id)
    }
  }, [
    currentSessionId,
    guestKey,
    queryClient,
    sessionQueryKey,
    sessionsQueryKey,
    sharedMode,
    t,
  ])

  const setSelectedMcpToolIds = useCallback((ids: string[]) => {
    if (sharedMode) {
      setSelectedMcpToolIdsState([])
      return
    }
    setSelectedMcpToolIdsState(ids)
  }, [sharedMode])

  // Update token/char counts when context selections change (debounced)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      buildContext().catch((error) => {
        console.error('Error updating context counts:', error)
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [buildContext])

  return {
    // State
    sessions,
    currentSession: currentSession || sessions.find(s => s.id === currentSessionId),
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

    // Actions
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
    refetchSessions
  }
}
