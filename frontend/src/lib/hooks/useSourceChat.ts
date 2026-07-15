'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { sourceChatApi } from '@/lib/api/source-chat'
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
import {
  SourceChatSession,
  SourceChatMessage,
  SourceChatContextIndicator,
  CreateSourceChatSessionRequest,
  UpdateSourceChatSessionRequest
} from '@/lib/types/api'
import { useChatQueue } from '@/lib/hooks/useChatQueue'
import { useChatStreamingBuffer } from '@/lib/hooks/useChatStreamingBuffer'
import { mergeActiveQueueMessages } from '@/lib/utils/chat-queue-messages'

export function useSourceChat(sourceId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SourceChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [contextIndicators, setContextIndicators] = useState<SourceChatContextIndicator | null>(null)
  const [selectedSkillIds, setSelectedSkillIdsState] = useState<string[]>([])
  const [pendingSkillIds, setPendingSkillIds] = useState<string[] | null>(null)
  const [selectedHtmlTemplateId, setSelectedHtmlTemplateIdState] = useState<string | null>(null)
  const [pendingHtmlTemplateId, setPendingHtmlTemplateId] = useState<string | null | undefined>(undefined)
  const [selectedMcpToolIds, setSelectedMcpToolIdsState] = useState<string[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const {
    streamContentRef,
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

  // Fetch sessions
  const { data: sessions = [], isLoading: loadingSessions, refetch: refetchSessions } = useQuery<SourceChatSession[]>({
    queryKey: QUERY_KEYS.sourceChatSessions(sourceId),
    queryFn: () => sourceChatApi.listSessions(sourceId),
    enabled: !!sourceId
  })

  // Fetch current session with messages
  const { data: currentSession, refetch: refetchCurrentSession } = useQuery({
    queryKey: QUERY_KEYS.sourceChatSession(sourceId, currentSessionId!),
    queryFn: () => sourceChatApi.getSession(sourceId, currentSessionId!),
    enabled: !!sourceId && !!currentSessionId
  })

  const chatQueue = useChatQueue(currentSessionId, {
    historyQueryKeys: currentSessionId
      ? [QUERY_KEYS.sourceChatSession(sourceId, currentSessionId)]
      : [],
    onCompletion: () => {
      void refetchCurrentSession()
    },
  })

  // Update messages when session changes
  useEffect(() => {
    if (currentSession?.messages) {
      setMessages(currentSession.messages)
    }
  }, [currentSession])

  // Restore skill / template selection from the active session (or pending)
  useEffect(() => {
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
  }, [currentSession, currentSessionId, pendingSkillIds, pendingHtmlTemplateId])

  // Auto-select most recent session when sessions are loaded
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      // Find most recent session (sessions are sorted by created date desc from API)
      const mostRecentSession = sessions[0]
      setCurrentSessionId(mostRecentSession.id)
    }
  }, [sessions, currentSessionId])

  // Prefetch the most recent session in parallel with session list resolution
  useEffect(() => {
    const firstSession = sessions[0]
    if (!firstSession || !sourceId) return

    void queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.sourceChatSession(sourceId, firstSession.id),
      queryFn: () => sourceChatApi.getSession(sourceId, firstSession.id),
    })
  }, [sessions, sourceId, queryClient])

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (data: Omit<CreateSourceChatSessionRequest, 'source_id'>) => 
      sourceChatApi.createSession(sourceId, data),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sourceChatSessions(sourceId) })
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
    mutationFn: ({ sessionId, data }: { sessionId: string, data: UpdateSourceChatSessionRequest }) =>
      sourceChatApi.updateSession(sourceId, sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sourceChatSessions(sourceId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sourceChatSession(sourceId, currentSessionId!) })
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
      sourceChatApi.deleteSession(sourceId, sessionId),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sourceChatSessions(sourceId) })
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

  // Send message with streaming
  const sendMessage = useCallback(async (message: string, modelOverride?: string) => {
    let sessionId = currentSessionId

    // Auto-create session if none exists
    if (!sessionId) {
      try {
        const defaultTitle = message.length > 30 ? `${message.substring(0, 30)}...` : message
        const newSession = await sourceChatApi.createSession(sourceId, {
          title: defaultTitle,
          skill_ids: selectedSkillIds,
          html_template_id: selectedHtmlTemplateId,
        })
        sessionId = newSession.id
        setCurrentSessionId(sessionId)
        setPendingSkillIds(null)
        setPendingHtmlTemplateId(undefined)
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sourceChatSessions(sourceId) })
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } }, message?: string };
        console.error('Failed to create chat session:', error)
        toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToCreateSession'))
        return
      }
    }

    // Add user message optimistically
    const userMessage: SourceChatMessage = {
      id: `temp-${Date.now()}`,
      type: 'human',
      content: message,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
    setIsStreaming(true)
    setStreamStatus(null)
    setActivityLog([])
    setLiveMcpToolCalls([])

    clearStreamingBuffers()
    abortControllerRef.current?.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const response = await sourceChatApi.sendMessage(
        sourceId,
        sessionId,
        {
          message,
          model_override: modelOverride,
          skill_ids: selectedSkillIds,
          mcp_tool_ids: selectedMcpToolIds,
          html_template_id: selectedHtmlTemplateId,
        },
        abortController.signal
      )

      if (!response) {
        throw new Error('No response body')
      }

      let aiMessageId: string | null = null

      await readAgUiSseStream(response, (event: AgUiEvent) => {
        switch (event.type) {
          case 'STEP_STARTED': {
            if (typeof event.stepName === 'string') {
              setStreamStatus(t(agentStepI18nKey(event.stepName)))
            }
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
            streamContentRef.current.set(aiMessageId, '')
            setMessages((prev) => [
              ...prev,
              {
                id: aiMessageId!,
                type: 'ai',
                content: '',
                timestamp: new Date().toISOString(),
              },
            ])
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
              streamContentRef.current.set(aiMessageId, delta)
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
              appendStreamingDelta(aiMessageId, delta)
            }
            break
          }
          case 'STATE_SNAPSHOT': {
            const snapshot = event.snapshot
            const indicators = snapshot?.context_indicators
            if (indicators && typeof indicators === 'object') {
              setContextIndicators(indicators as SourceChatContextIndicator)
            }
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
      }, abortController.signal)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      console.error('Error sending message:', error)
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToSendMessage'))
      // Remove optimistic messages on error
      setMessages(prev => prev.filter(msg => !msg.id.startsWith('temp-')))
    } finally {
      flushStreamingContent()
      clearStreamingBuffers()
      setIsStreaming(false)
      setStreamStatus(null)
      setActivityLog([])
      await refetchCurrentSession()
      if (sessionId) {
        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.mcpSessionToolCalls(sessionId),
        })
      }
      setLiveMcpToolCalls([])
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
      try {
        await chatQueue.ensureRunner()
      } catch (ensureError) {
        console.error('Error ensuring chat queue runner:', ensureError)
      }
    }
  }, [sourceId, currentSessionId, selectedSkillIds, selectedMcpToolIds, selectedHtmlTemplateId, refetchCurrentSession, queryClient, chatQueue, t, appendStreamingDelta, flushStreamingContent, clearStreamingBuffers])

  // Cancel streaming
  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
    }
  }, [])

  const enqueueMessage = useCallback(
    async (
      message: string,
      options: {
        modelOverride?: string
        loopCount: number
        scheduleRunner?: boolean
      }
    ) => {
      try {
        let sessionId = currentSessionId
        if (!sessionId) {
          const defaultTitle =
            message.length > 30 ? `${message.substring(0, 30)}...` : message
          const newSession = await sourceChatApi.createSession(sourceId, {
            title: defaultTitle,
            skill_ids: selectedSkillIds,
            html_template_id: selectedHtmlTemplateId,
          })
          sessionId = newSession.id
          setCurrentSessionId(sessionId)
          setPendingSkillIds(null)
          setPendingHtmlTemplateId(undefined)
          await queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.sourceChatSessions(sourceId),
          })
        }

        await chatQueue.enqueueForSession(sessionId, {
          prompt: message,
          loop_count: options.loopCount,
          schedule_runner: options.scheduleRunner,
          model_id:
            options.modelOverride ?? currentSession?.model_override ?? undefined,
          skill_ids: selectedSkillIds,
          tool_ids: selectedMcpToolIds,
          html_template_id: selectedHtmlTemplateId,
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
      chatQueue,
      currentSession?.model_override,
      currentSessionId,
      queryClient,
      selectedHtmlTemplateId,
      selectedMcpToolIds,
      selectedSkillIds,
      sourceId,
      t,
    ]
  )

  const queueMessages = useMemo(
    () => mergeActiveQueueMessages(messages, chatQueue.queue),
    [chatQueue.queue, messages]
  )
  const queueCurrentItem =
    chatQueue.queue?.current_item ??
    chatQueue.queue?.items.find((item) => item.status === 'running')
  const queueStreamStatus =
    typeof queueCurrentItem?.stream_progress?.message === 'string'
      ? queueCurrentItem.stream_progress.message
      : streamStatus
  const queueActivityLog = Array.isArray(
    queueCurrentItem?.stream_activity?.events
  )
    ? queueCurrentItem.stream_activity.events
        .map((event) =>
          event &&
          typeof event === 'object' &&
          'message' in event &&
          typeof event.message === 'string'
            ? event.message
            : null
        )
        .filter((event): event is string => event !== null)
    : activityLog

  // Switch session
  const switchSession = useCallback((sessionId: string) => {
    setPendingSkillIds(null)
    setPendingHtmlTemplateId(undefined)
    setCurrentSessionId(sessionId)
    setContextIndicators(null)
  }, [])

  // Create session
  const createSession = useCallback((data: Omit<CreateSourceChatSessionRequest, 'source_id'>) => {
    setPendingSkillIds(null)
    setPendingHtmlTemplateId(undefined)
    return createSessionMutation.mutate({
      ...data,
      skill_ids: data.skill_ids ?? selectedSkillIds,
      html_template_id:
        data.html_template_id !== undefined
          ? data.html_template_id
          : selectedHtmlTemplateId,
    })
  }, [createSessionMutation, selectedSkillIds, selectedHtmlTemplateId])

  // Update session
  const updateSession = useCallback((sessionId: string, data: UpdateSourceChatSessionRequest) => {
    return updateSessionMutation.mutate({ sessionId, data })
  }, [updateSessionMutation])

  // Delete session
  const deleteSession = useCallback((sessionId: string) => {
    return deleteSessionMutation.mutate(sessionId)
  }, [deleteSessionMutation])

  const setSelectedSkillIds = useCallback((ids: string[]) => {
    setSelectedSkillIdsState(ids)
    if (currentSessionId) {
      void (async () => {
        try {
          await sourceChatApi.updateSession(sourceId, currentSessionId, { skill_ids: ids })
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sourceChatSessions(sourceId) })
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.sourceChatSession(sourceId, currentSessionId),
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
  }, [currentSessionId, sourceId, queryClient, t])

  const setSelectedHtmlTemplateId = useCallback((id: string | null) => {
    setSelectedHtmlTemplateIdState(id)
    if (currentSessionId) {
      void (async () => {
        try {
          await sourceChatApi.updateSession(sourceId, currentSessionId, {
            html_template_id: id,
          })
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sourceChatSessions(sourceId) })
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.sourceChatSession(sourceId, currentSessionId),
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
  }, [currentSessionId, sourceId, queryClient, t])

  const setSelectedMcpToolIds = useCallback((ids: string[]) => {
    setSelectedMcpToolIdsState(ids)
  }, [])

  return {
    // State
    sessions,
    currentSession: sessions.find(s => s.id === currentSessionId) || currentSession,
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
    queueHasWork: Boolean(
      chatQueue.queue?.items.some(
        (item) => item.status === 'pending' || item.status === 'running'
      )
    ),
    queueStreamError: chatQueue.streamError,
    
    // Actions
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
