'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { chatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  CreateProjectChatSessionRequest,
  UpdateProjectChatSessionRequest,
  SourceListResponse,
  NoteResponse,
  ProjectChatMessage,
  ProjectChatSession,
} from '@/lib/types/api'
import type { ContextSelections } from '@/lib/types/project-context'
import type { Artifact } from '@/lib/types/artifacts'
import { useChatRuntime } from '@/lib/hooks/useChatRuntime'
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
  const [tokenCount, setTokenCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)
  const [pendingModelOverride, setPendingModelOverride] = useState<string | null>(
    null
  )

  const sessionsQueryKey = useMemo(
    () => QUERY_KEYS.projectChatSessions(projectId, guestKey),
    [projectId, guestKey]
  )

  const sessionQueryKey = useCallback(
    (sessionId: string) => QUERY_KEYS.projectChatSession(sessionId, guestKey),
    [guestKey]
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

  const runtime = useChatRuntime<
    ProjectChatSession,
    CreateProjectChatSessionRequest,
    UpdateProjectChatSessionRequest,
    ProjectChatMessage
  >({
    dataSource: {
      sessionsQueryKey,
      sessionQueryKey,
      listSessions: () => chatApi.listSessions(projectId, guestKey),
      getSession: (sessionId) => chatApi.getSession(sessionId, guestKey),
      enabled: !!projectId && (!sharedMode || !!guestKey),
    },
    mutations: {
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
    },
    skillSelection: {
      disabled: sharedMode,
      persistSession: (sessionId, data) =>
        chatApi.updateSession(sessionId, data, guestKey),
    },
    ensureSession: {
      createSessionForMessage: (ctx, title) =>
        chatApi.createSession(
          {
            project_id: projectId,
            title,
            model_override: sharedMode
              ? undefined
              : (pendingModelOverride ?? undefined),
            skill_ids: sharedMode ? [] : ctx.selectedSkillIdsRef.current,
            html_template_id: sharedMode
              ? null
              : ctx.selectedHtmlTemplateIdRef.current,
            guest_key: guestKey ?? undefined,
          },
          guestKey
        ),
    },
    buildSendRequest: (ctx, { sessionId, message, modelOverride, editMessageId }) => {
      const context_config = buildContextConfig()
      void buildContext().catch(() => {})
      return chatApi.sendMessage(
        {
          session_id: sessionId,
          message,
          context_config,
          model_override: sharedMode
            ? undefined
            : (modelOverride ?? ctx.currentSession?.model_override ?? undefined),
          skill_ids: sharedMode ? [] : ctx.selectedSkillIdsRef.current,
          mcp_tool_ids: sharedMode ? [] : ctx.selectedMcpToolIdsRef.current,
          html_template_id: sharedMode
            ? null
            : ctx.selectedHtmlTemplateIdRef.current,
          edit_message_id: editMessageId,
          artifact_id: sharedMode ? undefined : (activeArtifactId ?? undefined),
        },
        guestKey
      )
    },
    sendTurn: {
      supportsEditResend: true,
      sseHandlerOptions: {
        flushOnTextMessageEnd: true,
        clearBuffersOnRunFinished: true,
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
        model_id:
          modelOverride ??
          ctx.currentSession?.model_override ??
          pendingModelOverride ??
          undefined,
        skill_ids: ctx.selectedSkillIdsRef.current,
        tool_ids: ctx.selectedMcpToolIdsRef.current,
        html_template_id: ctx.selectedHtmlTemplateIdRef.current,
        artifact_id: activeArtifactId ?? undefined,
        context_config: buildContextConfig(),
      }),
    },
    presentation: { directStream: sharedMode },
    queueSessionId: sharedMode ? null : undefined,
    clearPendingModelOverride: () => setPendingModelOverride(null),
    resolveCurrentSession: (sessions, currentSessionId, currentSession) =>
      currentSession || sessions.find((session) => session.id === currentSessionId),
  })

  const {
    sessions,
    currentSession,
    currentSessionId,
    setMessages,
    loadingSessions,
    refetchSessions,
    liveMcpToolCalls,
    selectedSkillIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    selectedSkillIdsRef,
    selectedHtmlTemplateIdRef,
    selectedMcpToolIdsRef,
    setSelectedSkillIds,
    setSelectedHtmlTemplateId,
    setSelectedMcpToolIds,
    updateSessionMutation,
    mutateCreateSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    isSending,
    enqueueMessage,
    chatQueue,
    queueHasWork,
    presentationView,
    clearPending,
  } = runtime

  const enqueueMessageResolved = useMemo(
    () =>
      sharedMode
        ? async (message: string, options: { modelOverride?: string; loopCount: number }) => {
            await sendMessage(message, options.modelOverride)
          }
        : enqueueMessage,
    [enqueueMessage, sendMessage, sharedMode]
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
    const sessionMessages = (
      currentSession as { messages?: ProjectChatMessage[] } | undefined
    )?.messages
    if (sessionMessages) {
      hydrateA2uiFromMessages(sessionMessages)
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
  }, [setMessages])

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
    currentSession,
    currentSessionId,
    messages: presentationView.messages,
    isSending: presentationView.isSending,
    streamStatus: presentationView.streamStatus,
    activityLog: presentationView.activityLog,
    loadingSessions,
    tokenCount,
    charCount,
    pendingModelOverride,
    selectedSkillIds,
    selectedHtmlTemplateId,
    selectedMcpToolIds,
    liveMcpToolCalls,
    queue: presentationView.queue,
    queueHasWork,
    queueStreamError: chatQueue.streamError,
    isDirectSending: isSending,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    enqueueMessage: enqueueMessageResolved,
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
