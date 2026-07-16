'use client'

import { useState, useCallback, useMemo, type RefObject } from 'react'
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useChatQueue } from '@/lib/hooks/useChatQueue'
import { useChatStreamingBuffer } from '@/lib/hooks/useChatStreamingBuffer'
import { useChatSessionSelection } from '@/lib/hooks/useChatSessionSelection'
import {
  useChatSessionMutations,
  type ChatSessionMutationsAdapter,
} from '@/lib/hooks/useChatSessionMutations'
import { useChatSkillSelection } from '@/lib/hooks/useChatSkillSelection'
import {
  useChatSendTurn,
  type UseChatSendTurnOptions,
} from '@/lib/hooks/useChatSendTurn'
import {
  applyAutoCreatedSessionSideEffects,
  useChatEnqueueMessage,
} from '@/lib/hooks/useChatEnqueueMessage'
import { useChatQueuePresentation } from '@/lib/hooks/useChatQueuePresentation'
import { ensureChatSessionForMessage } from '@/lib/hooks/chat-session-utils'
import type { ChatStreamMessage } from '@/lib/hooks/chat-sse-handlers'
import type { ChatStreamingBufferReturn } from '@/lib/hooks/useChatStreamingBuffer'
import type { ChatQueueEnqueueInput } from '@/lib/types/chat-queue'

export interface ChatRuntimeDataSource<TSession extends { id: string }> {
  sessionsQueryKey: QueryKey
  sessionQueryKey: (sessionId: string) => QueryKey
  listSessions: () => Promise<TSession[]>
  getSession: (sessionId: string) => Promise<TSession>
  enabled?: boolean
}

export interface ChatRuntimeSendContext<TSession extends ChatRuntimeSessionRecord> {
  selectedSkillIdsRef: RefObject<string[]>
  selectedHtmlTemplateIdRef: RefObject<string | null>
  selectedMcpToolIdsRef: RefObject<string[]>
  currentSession: TSession | undefined
}

export interface ChatRuntimeEnsureSessionConfig<
  TSession extends ChatRuntimeSessionRecord,
> {
  createSessionForMessage: (
    ctx: ChatRuntimeSendContext<TSession>,
    title: string
  ) => Promise<TSession>
  /** When true, log create errors to console (source chat). Default false. */
  logCreateError?: boolean
}

export interface ChatRuntimeEnqueueConfig<
  TSession extends ChatRuntimeSessionRecord,
> {
  buildEnqueuePayload: (
    ctx: ChatRuntimeSendContext<TSession>,
    params: {
      message: string
      modelOverride?: string
      loopCount: number
      scheduleRunner?: boolean
    }
  ) => ChatQueueEnqueueInput
  fallbackToSend?: (message: string, modelOverride?: string) => Promise<void>
}

export interface ChatRuntimePresentationConfig {
  /** When true, surface direct stream state instead of queue-merged presentation. */
  directStream?: boolean
}

export interface ChatRuntimeSendTurnLifecycle {
  beforeSend?: (streaming: ChatStreamingBufferReturn) => void
  onSendFinally?: (
    streaming: ChatStreamingBufferReturn,
    sessionId: string | undefined
  ) => void | Promise<void>
  getAbortSignal?: () => AbortSignal | undefined
}

export interface ChatRuntimeSessionRecord {
  id: string
  model_override?: string | null
  skill_ids?: string[] | null
  html_template_id?: string | null
  messages?: ChatStreamMessage[]
}

export interface UseChatRuntimeOptions<
  TSession extends ChatRuntimeSessionRecord,
  TCreateData,
  TUpdateData,
  TMessage extends ChatStreamMessage,
> {
  dataSource: ChatRuntimeDataSource<TSession>
  mutations: {
    api: ChatSessionMutationsAdapter<TSession, TCreateData, TUpdateData>
    toastOnCreate?: boolean
  }
  skillSelection: {
    persistSession: (
      sessionId: string,
      data: { skill_ids?: string[]; html_template_id?: string | null }
    ) => Promise<unknown>
    disabled?: boolean
  }
  ensureSession: ChatRuntimeEnsureSessionConfig<TSession>
  buildSendRequest: (
    ctx: ChatRuntimeSendContext<TSession>,
    params: {
      sessionId: string
      message: string
      modelOverride?: string
      editMessageId?: string
    }
  ) => Promise<ReadableStream<Uint8Array>>
  sendTurn?: Partial<
    Omit<
      UseChatSendTurnOptions<TMessage>,
      | 'messages'
      | 'setMessages'
      | 'refetchCurrentSession'
      | 'queryClient'
      | 'chatQueue'
      | 'streaming'
      | 't'
      | 'ensureSession'
      | 'buildSendRequest'
      | 'beforeSend'
      | 'onSendFinally'
      | 'getAbortSignal'
    >
  >
  sendTurnLifecycle?: ChatRuntimeSendTurnLifecycle
  enqueue: ChatRuntimeEnqueueConfig<TSession>
  presentation?: ChatRuntimePresentationConfig
  /** When null, chat queue is detached (project sharedMode). Defaults to currentSessionId. */
  queueSessionId?: string | null
  clearPendingModelOverride?: () => void
  onSwitchSession?: () => void
  resolveCurrentSession?: (
    sessions: TSession[],
    currentSessionId: string | null,
    currentSession: TSession | undefined
  ) => TSession | undefined
}

/**
 * Shared chat orchestration for project/source adapters: session lifecycle,
 * ensureSession, send/enqueue wiring, and queue presentation assembly.
 */
export function useChatRuntime<
  TSession extends ChatRuntimeSessionRecord,
  TCreateData,
  TUpdateData,
  TMessage extends ChatStreamMessage,
>({
  buildSendRequest: buildSendRequestPlugin,
  enqueue: enqueueConfig,
  dataSource,
  mutations,
  skillSelection,
  ensureSession: ensureSessionConfig,
  sendTurn,
  sendTurnLifecycle,
  presentation,
  queueSessionId: queueSessionIdOverride,
  clearPendingModelOverride,
  onSwitchSession,
  resolveCurrentSession,
}: UseChatRuntimeOptions<TSession, TCreateData, TUpdateData, TMessage>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TMessage[]>([])

  const streaming = useChatStreamingBuffer(setMessages)
  const { streamStatus, activityLog, liveMcpToolCalls } = streaming

  const {
    sessionsQueryKey,
    sessionQueryKey,
    listSessions,
    getSession,
    enabled = true,
  } = dataSource

  const {
    data: sessions = [],
    isLoading: loadingSessions,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: listSessions,
    enabled,
  })

  const { data: currentSession, refetch: refetchCurrentSession } = useQuery({
    queryKey: sessionQueryKey(currentSessionId!),
    queryFn: () => getSession(currentSessionId!),
    enabled: enabled && !!currentSessionId,
  })

  const effectiveQueueSessionId =
    queueSessionIdOverride !== undefined
      ? queueSessionIdOverride
      : currentSessionId

  const chatQueue = useChatQueue(effectiveQueueSessionId, {
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
        queryFn: () => getSession(sessionId),
      })
    },
    [getSession, queryClient, sessionQueryKey]
  )

  useChatSessionSelection({
    sessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession: currentSession as
      | (ChatRuntimeSessionRecord & { messages?: TMessage[] })
      | undefined,
    setMessages,
    prefetchSession,
  })

  const skillSelectionState = useChatSkillSelection({
    currentSessionId,
    currentSession: currentSession as ChatRuntimeSessionRecord | undefined,
    disabled: skillSelection.disabled,
    sessionsQueryKey,
    sessionQueryKey,
    persistSession: skillSelection.persistSession,
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
  } = skillSelectionState

  const sessionMutations = useChatSessionMutations<
    TSession,
    TCreateData,
    TUpdateData,
    TMessage
  >({
    sessionsQueryKey,
    sessionQueryKey,
    currentSessionId,
    setCurrentSessionId,
    setMessages,
    toastOnCreate: mutations.toastOnCreate,
    api: mutations.api,
  })

  const {
    updateSessionMutation,
    createSession: mutateCreateSession,
    updateSession,
    deleteSession,
    switchSession: switchSessionBase,
  } = sessionMutations

  const sendContext = useMemo<ChatRuntimeSendContext<TSession>>(
    () => ({
      selectedSkillIdsRef,
      selectedHtmlTemplateIdRef,
      selectedMcpToolIdsRef,
      currentSession,
    }),
    [
      currentSession,
      selectedHtmlTemplateIdRef,
      selectedMcpToolIdsRef,
      selectedSkillIdsRef,
    ]
  )

  const buildSendRequest = useCallback(
    (params: {
      sessionId: string
      message: string
      modelOverride?: string
      editMessageId?: string
    }) => buildSendRequestPlugin(sendContext, params),
    [buildSendRequestPlugin, sendContext]
  )

  const buildEnqueuePayload = useCallback(
    (params: {
      message: string
      modelOverride?: string
      loopCount: number
      scheduleRunner?: boolean
    }) => enqueueConfig.buildEnqueuePayload(sendContext, params),
    [enqueueConfig, sendContext]
  )

  const applyCreatedSession = useMemo(
    () =>
      applyAutoCreatedSessionSideEffects({
        setCurrentSessionId,
        clearPendingOnSessionCreated,
        invalidateSessionsList: () => {
          void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
        },
        clearPendingModelOverride,
      }),
    [clearPendingOnSessionCreated, clearPendingModelOverride, queryClient, sessionsQueryKey]
  )

  const ensureSession = useCallback(
    async (message: string): Promise<string | null> => {
      try {
        const result = await ensureChatSessionForMessage({
          currentSessionId,
          message,
          createSession: (title) =>
            ensureSessionConfig.createSessionForMessage(sendContext, title),
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
        if (ensureSessionConfig.logCreateError) {
          console.error('Failed to create chat session:', error)
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
      ensureSessionConfig,
      sendContext,
      t,
    ]
  )

  const { sendMessage, isSending, cancelSending } = useChatSendTurn<TMessage>({
    messages,
    setMessages,
    refetchCurrentSession,
    queryClient,
    chatQueue,
    streaming,
    t,
    ensureSession,
    buildSendRequest,
    beforeSend: sendTurnLifecycle?.beforeSend
      ? () => sendTurnLifecycle.beforeSend?.(streaming)
      : undefined,
    onSendFinally: sendTurnLifecycle?.onSendFinally
      ? (sessionId) => sendTurnLifecycle.onSendFinally?.(streaming, sessionId)
      : undefined,
    getAbortSignal: sendTurnLifecycle?.getAbortSignal,
    ...sendTurn,
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

  const { enqueueMessage } = useChatEnqueueMessage({
    currentSessionId,
    chatQueue,
    t,
    ensureSession: ensureSessionForEnqueue,
    buildEnqueuePayload,
    fallbackToSend: enqueueConfig.fallbackToSend,
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

  const directStream = presentation?.directStream ?? false

  const resolvedCurrentSession = useMemo(() => {
    if (resolveCurrentSession) {
      return resolveCurrentSession(sessions, currentSessionId, currentSession)
    }
    return currentSession ?? sessions.find((session) => session.id === currentSessionId)
  }, [currentSession, currentSessionId, resolveCurrentSession, sessions])

  const switchSession = useCallback(
    (sessionId: string) => {
      switchSessionBase(sessionId, clearPending)
      onSwitchSession?.()
    },
    [clearPending, onSwitchSession, switchSessionBase]
  )

  const presentationView = useMemo(
    () => ({
      messages: directStream ? messages : queueMessages,
      streamStatus: directStream ? streamStatus : queueStreamStatus,
      activityLog: directStream ? activityLog : queueActivityLog,
      isSending: directStream
        ? isSending
        : isSending || Boolean(queueCurrentItem),
      queue: directStream ? undefined : chatQueue.queue,
    }),
    [
      activityLog,
      chatQueue.queue,
      directStream,
      isSending,
      messages,
      queueActivityLog,
      queueCurrentItem,
      queueMessages,
      queueStreamStatus,
      streamStatus,
    ]
  )

  return {
    sessions,
    currentSession: resolvedCurrentSession,
    currentSessionId,
    messages,
    setMessages,
    setCurrentSessionId,
    loadingSessions,
    refetchSessions,
    refetchCurrentSession,
    streaming,
    streamStatus,
    activityLog,
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
    clearPending,
    updateSessionMutation,
    mutateCreateSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    isSending,
    cancelSending,
    enqueueMessage,
    chatQueue,
    queueHasWork,
    presentationView,
    ensureSession,
    queryClient,
    sessionsQueryKey,
    sessionQueryKey,
  }
}
