'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { chatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  agentStepI18nKey,
  readAgUiSseStream,
  type AgUiEvent,
} from '@/lib/ag-ui/events'
import {
  formatAgentProgressLogLine,
  formatAgentProgressStatus,
  parseAgentProgressEvent,
} from '@/lib/ag-ui/progress'
import {
  parseMcpToolCallEvent,
  upsertMcpToolCall,
} from '@/lib/ag-ui/mcp-tool-calls'
import { ChatToolCall } from '@/lib/types/mcp'
import {
  NotebookChatMessage,
  CreateNotebookChatSessionRequest,
  UpdateNotebookChatSessionRequest,
  SourceListResponse,
  NoteResponse
} from '@/lib/types/api'
import { ContextSelections } from '@/app/(dashboard)/notebooks/[id]/page'

interface UseNotebookChatParams {
  notebookId: string
  sources: SourceListResponse[]
  notes: NoteResponse[]
  contextSelections: ContextSelections
}

export function useNotebookChat({ notebookId, sources, notes, contextSelections }: UseNotebookChatParams) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<NotebookChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [tokenCount, setTokenCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)
  // Pending model override for when user changes model before a session exists
  const [pendingModelOverride, setPendingModelOverride] = useState<string | null>(null)
  const [selectedSkillIds, setSelectedSkillIdsState] = useState<string[]>([])
  const [pendingSkillIds, setPendingSkillIds] = useState<string[] | null>(null)
  const [selectedMcpToolIds, setSelectedMcpToolIdsState] = useState<string[]>([])
  const [streamStatus, setStreamStatus] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<string[]>([])
  const [liveMcpToolCalls, setLiveMcpToolCalls] = useState<ChatToolCall[]>([])

  // Fetch sessions for this notebook
  const {
    data: sessions = [],
    isLoading: loadingSessions,
    refetch: refetchSessions
  } = useQuery({
    queryKey: QUERY_KEYS.notebookChatSessions(notebookId),
    queryFn: () => chatApi.listSessions(notebookId),
    enabled: !!notebookId
  })

  // Fetch current session with messages
  const {
    data: currentSession,
    refetch: refetchCurrentSession
  } = useQuery({
    queryKey: QUERY_KEYS.notebookChatSession(currentSessionId!),
    queryFn: () => chatApi.getSession(currentSessionId!),
    enabled: !!notebookId && !!currentSessionId
  })

  // Update messages when current session changes
  useEffect(() => {
    if (currentSession?.messages) {
      setMessages(currentSession.messages)
    }
  }, [currentSession])

  // Restore skill selection from the active session (or pending selection)
  useEffect(() => {
    if (!currentSessionId) {
      setSelectedSkillIdsState(pendingSkillIds ?? [])
      return
    }
    // Active session owns selection; pending was only for pre-session picks
    if (pendingSkillIds !== null) {
      setPendingSkillIds(null)
    }
    if (currentSession) {
      setSelectedSkillIdsState(currentSession.skill_ids ?? [])
    }
  }, [currentSession, currentSessionId, pendingSkillIds])

  // Auto-select most recent session when sessions are loaded
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      // Sessions are sorted by created date desc from API
      const mostRecentSession = sessions[0]
      setCurrentSessionId(mostRecentSession.id)
    }
  }, [sessions, currentSessionId])

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (data: CreateNotebookChatSessionRequest) =>
      chatApi.createSession(data),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
      })
      setCurrentSessionId(newSession.id)
      toast.success(t('chat.sessionCreated'))
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
      data: UpdateNotebookChatSessionRequest
    }) => chatApi.updateSession(sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
      })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSession(currentSessionId!)
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
      chatApi.deleteSession(sessionId),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
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
      notebook_id: notebookId,
      context_config
    })

    setTokenCount(response.token_count)
    setCharCount(response.char_count)

    return response.context
  }, [notebookId, buildContextConfig])

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
          notebook_id: notebookId,
          title: defaultTitle,
          model_override: pendingModelOverride ?? undefined,
          skill_ids: selectedSkillIds,
        })
        sessionId = newSession.id
        setCurrentSessionId(sessionId)
        // Clear pending overrides now that they're applied to the session
        setPendingModelOverride(null)
        setPendingSkillIds(null)
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
        })
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } }, message?: string };
        toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToCreateSession'))
        return
      }
    }

    // Add user message optimistically
    const userMessage: NotebookChatMessage = {
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
        model_override: modelOverride ?? (currentSession?.model_override ?? undefined),
        skill_ids: selectedSkillIds,
        mcp_tool_ids: selectedMcpToolIds,
        edit_message_id: editMessageId,
      })

      let aiMessageId: string | null = null

      await readAgUiSseStream(body, (event: AgUiEvent) => {
        switch (event.type) {
          case 'STEP_STARTED': {
            if (typeof event.stepName === 'string') {
              setStreamStatus(t(agentStepI18nKey(event.stepName)))
            }
            break
          }
          case 'STEP_FINISHED': {
            break
          }
          case 'CUSTOM': {
            const progress = parseAgentProgressEvent(event)
            if (progress) {
              const status = formatAgentProgressStatus(progress, t)
              if (status) {
                setStreamStatus(status)
              }
              const logLine = formatAgentProgressLogLine(progress, t)
              if (logLine) {
                setActivityLog((prev) => [...prev, logLine])
              }
            }
            const toolCallUpdate = parseMcpToolCallEvent(event)
            if (toolCallUpdate) {
              setLiveMcpToolCalls((prev) => upsertMcpToolCall(prev, toolCallUpdate))
            }
            break
          }
          case 'TEXT_MESSAGE_START': {
            aiMessageId = (event.messageId as string) || `ai-${Date.now()}`
            const newMsg: NotebookChatMessage = {
              id: aiMessageId,
              type: 'ai',
              content: '',
              timestamp: new Date().toISOString(),
            }
            setMessages((prev) => [...prev, newMsg])
            break
          }
          case 'TEXT_MESSAGE_CONTENT':
          case 'TEXT_MESSAGE_CHUNK': {
            const delta =
              typeof event.delta === 'string'
                ? event.delta
                : typeof event.content === 'string'
                  ? event.content
                  : ''
            if (!delta) {
              break
            }
            if (!aiMessageId) {
              aiMessageId = (event.messageId as string) || `ai-${Date.now()}`
              setMessages((prev) => [
                ...prev,
                {
                  id: aiMessageId!,
                  type: 'ai',
                  content: delta,
                  timestamp: new Date().toISOString(),
                },
              ])
            } else {
              const targetId = aiMessageId
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === targetId
                    ? { ...msg, content: msg.content + delta }
                    : msg
                )
              )
            }
            break
          }
          case 'TEXT_MESSAGE_END': {
            setStreamStatus(null)
            break
          }
          case 'RUN_FINISHED': {
            setStreamStatus(null)
            break
          }
          case 'RUN_ERROR': {
            throw new Error(
              typeof event.message === 'string' ? event.message : 'Stream error'
            )
          }
          default:
            break
        }
      })

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
    }
  }, [
    notebookId,
    currentSessionId,
    currentSession,
    pendingModelOverride,
    selectedSkillIds,
    selectedMcpToolIds,
    messages,
    buildContext,
    buildContextConfig,
    refetchCurrentSession,
    queryClient,
    t
  ])

  const editAndResend = useCallback(async (messageId: string, content: string, modelOverride?: string) => {
    if (!content.trim()) {
      return
    }
    await sendMessage(content.trim(), modelOverride, messageId)
  }, [sendMessage])

  // Switch session
  const switchSession = useCallback((sessionId: string) => {
    setPendingSkillIds(null)
    setCurrentSessionId(sessionId)
  }, [])

  // Create session
  const createSession = useCallback((title?: string) => {
    setPendingSkillIds(null)
    return createSessionMutation.mutate({
      notebook_id: notebookId,
      title,
      skill_ids: selectedSkillIds,
    })
  }, [createSessionMutation, notebookId, selectedSkillIds])

  // Update session
  const updateSession = useCallback((sessionId: string, data: UpdateNotebookChatSessionRequest) => {
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
  }, [currentSessionId, updateSessionMutation])

  // Persist skill selection on the session so it survives across messages
  const setSelectedSkillIds = useCallback((ids: string[]) => {
    setSelectedSkillIdsState(ids)
    if (currentSessionId) {
      void (async () => {
        try {
          await chatApi.updateSession(currentSessionId, { skill_ids: ids })
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.notebookChatSessions(notebookId),
          })
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.notebookChatSession(currentSessionId),
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
  }, [currentSessionId, notebookId, queryClient, t])

  const setSelectedMcpToolIds = useCallback((ids: string[]) => {
    setSelectedMcpToolIdsState(ids)
  }, [])

  // Update token/char counts when context selections change
  useEffect(() => {
    const updateContextCounts = async () => {
      try {
        await buildContext()
      } catch (error) {
        console.error('Error updating context counts:', error)
      }
    }
    updateContextCounts()
  }, [buildContext])

  return {
    // State
    sessions,
    currentSession: currentSession || sessions.find(s => s.id === currentSessionId),
    currentSessionId,
    messages,
    isSending,
    streamStatus,
    activityLog,
    loadingSessions,
    tokenCount,
    charCount,
    pendingModelOverride,
    selectedSkillIds,
    selectedMcpToolIds,
    liveMcpToolCalls,

    // Actions
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    editAndResend,
    setModelOverride,
    setSelectedSkillIds,
    setSelectedMcpToolIds,
    refetchSessions
  }
}
