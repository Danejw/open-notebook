'use client'

import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chatQueueApi } from '@/lib/api/chat-queue'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type {
  ChatQueueCompletion,
  ChatQueueEnqueueInput,
  ChatQueueItemEnqueuePayload,
  ChatQueueItemResponse,
  ChatQueueItemUpdatePayload,
  ChatQueueReorderPayload,
  ChatQueueResponse,
  ChatQueueStreamEvent,
} from '@/lib/types/chat-queue'
import {
  isChatQueueItemActive,
} from '@/lib/types/chat-queue'

export interface UseChatQueueOptions {
  historyQueryKeys?: readonly QueryKey[]
  onCompletion?: (completion: ChatQueueCompletion) => void
  onStreamError?: (error: Error) => void
}

type ChatQueueQueryKey = ReturnType<typeof QUERY_KEYS.chatQueue>

interface OptimisticContext {
  previous: ChatQueueResponse | undefined
  baseRevision: number
  queryKey: ChatQueueQueryKey
}

interface SessionMutation {
  sessionId: string
  queryKey: ChatQueueQueryKey
}

interface QueueItemMutation extends SessionMutation {
  itemId: string
  payload: ChatQueueItemUpdatePayload
}

interface QueueEnqueueMutation extends SessionMutation {
  payload: ChatQueueItemEnqueuePayload
}

interface QueueDeleteMutation extends SessionMutation {
  itemId: string
}

type QueueReorderMutation = SessionMutation & ChatQueueReorderPayload

export type ChatQueueMergeUpdate =
  | { kind: 'snapshot'; queue: ChatQueueResponse }
  | { kind: 'item'; item: ChatQueueItemResponse; revision?: number }
  | { kind: 'stream'; event: ChatQueueStreamEvent }

const LOCAL_QUEUE_STATE = Symbol('local-chat-queue-state')

type LocalChatQueueState = ChatQueueResponse & {
  [LOCAL_QUEUE_STATE]?: true
}

function markLocalQueueState(
  queue: ChatQueueResponse
): ChatQueueResponse {
  const localQueue: LocalChatQueueState = { ...queue }
  Object.defineProperty(localQueue, LOCAL_QUEUE_STATE, {
    configurable: false,
    enumerable: false,
    value: true,
  })
  return localQueue
}

/**
 * Creates a stable idempotency key, including browsers without randomUUID.
 */
export function generateChatQueueRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}

function sortQueueItems(items: ChatQueueItemResponse[]): ChatQueueItemResponse[] {
  // Keep FIFO order (lowest position first) so merged state matches drain order.
  return [...items].sort((left, right) => {
    const positionDifference = left.position - right.position
    if (positionDifference !== 0) {
      return positionDifference
    }
    return left.id.localeCompare(right.id)
  })
}

/**
 * Merges snapshots, item responses, and SSE events without revision regression.
 */
export function mergeChatQueueState(
  current: ChatQueueResponse | undefined,
  update: ChatQueueMergeUpdate
): ChatQueueResponse | undefined {
  let revision: number
  let snapshot: ChatQueueResponse | undefined
  let item: ChatQueueItemResponse | undefined

  switch (update.kind) {
    case 'snapshot':
      revision = update.queue.revision
      snapshot = update.queue
      if ((snapshot as LocalChatQueueState)[LOCAL_QUEUE_STATE]) {
        return snapshot
      }
      break
    case 'item':
      revision = update.revision ?? update.item.stream_revision
      item = update.item
      break
    case 'stream':
      switch (update.event.event) {
        case 'snapshot':
        case 'queue':
          revision = update.event.revision
          snapshot = update.event.queue
          break
        case 'item':
          revision = update.event.revision
          item = update.event.item
          break
        case 'heartbeat':
          return current
        default: {
          const exhaustiveEvent: never = update.event
          return exhaustiveEvent
        }
      }
      break
    default: {
      const exhaustiveUpdate: never = update
      return exhaustiveUpdate
    }
  }

  if (current && revision <= current.revision) {
    return current
  }
  if (snapshot) {
    return snapshot
  }
  if (!current || !item) {
    return current
  }

  const existingIndex = current.items.findIndex(
    (candidate) => candidate.id === item.id
  )
  let items: ChatQueueItemResponse[]
  if (!item.visible) {
    items = current.items.filter((candidate) => candidate.id !== item.id)
  } else if (existingIndex === -1) {
    items = sortQueueItems([...current.items, item])
  } else {
    items = sortQueueItems(
      current.items.map((candidate) =>
        candidate.id === item.id ? item : candidate
      )
    )
  }

  const currentItem =
    item.status === 'running'
      ? item
      : current.current_item?.id === item.id
        ? null
        : current.current_item

  return {
    ...current,
    revision,
    items,
    current_item: currentItem,
    updated: item.updated,
  }
}

/**
 * Applies a stream event through the shared revision-aware merge.
 */
export function applyChatQueueStreamEvent(
  current: ChatQueueResponse | undefined,
  event: ChatQueueStreamEvent
): ChatQueueResponse | undefined {
  return mergeChatQueueState(current, { kind: 'stream', event })
}

/**
 * Reports whether a queue can change without another user mutation.
 */
export function shouldStreamQueue(queue: ChatQueueResponse): boolean {
  const hasRunningItem = queue.items.some((item) => item.status === 'running')

  switch (queue.status) {
    case 'paused':
      return queue.runner_state !== 'idle' || hasRunningItem
    case 'active':
      switch (queue.runner_state) {
        case 'scheduled':
        case 'running':
          return true
        case 'idle':
          return queue.items.some((item) => isChatQueueItemActive(item.status))
        default: {
          const exhaustiveRunnerState: never = queue.runner_state
          return exhaustiveRunnerState
        }
      }
    default: {
      const exhaustiveStatus: never = queue.status
      return exhaustiveStatus
    }
  }
}

function isConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return false
  }
  const response = error.response
  return (
    !!response &&
    typeof response === 'object' &&
    'status' in response &&
    response.status === 409
  )
}

function patchOptimisticItem(
  item: ChatQueueItemResponse,
  payload: ChatQueueItemUpdatePayload
): ChatQueueItemResponse {
  const executionSnapshot = { ...item.execution_snapshot }
  const selectorFields = [
    'model_id',
    'skill_ids',
    'tool_ids',
    'html_template_id',
    'artifact_id',
    'context_config',
    'forwarded_props',
  ] as const

  for (const field of selectorFields) {
    if (field in payload) {
      const value = payload[field]
      if (value === undefined) {
        continue
      }
      if (field === 'context_config' || field === 'forwarded_props') {
        executionSnapshot[field] = value as Record<string, unknown> | null
      } else if (field === 'skill_ids' || field === 'tool_ids') {
        executionSnapshot[field] = value as string[] | null
      } else {
        executionSnapshot[field] = value as string | null
      }
    }
  }

  return {
    ...item,
    ...(payload.prompt !== undefined ? { prompt: payload.prompt } : {}),
    ...(payload.loop_count !== undefined
      ? { loop_count: payload.loop_count }
      : {}),
    execution_snapshot: executionSnapshot,
  }
}

function queueCompletions(
  previous: ChatQueueResponse,
  next: ChatQueueResponse
): ChatQueueCompletion[] {
  const completions: ChatQueueCompletion[] = []

  for (const previousItem of previous.items) {
    if (previousItem.status === 'completed') {
      continue
    }
    const nextItem = next.items.find((item) => item.id === previousItem.id)
    if (nextItem?.status === 'completed') {
      completions.push({
        type: 'item-completed',
        queue: next,
        item: nextItem,
      })
    }
  }

  const queueDrained =
    previous.runner_state !== 'idle' &&
    next.runner_state === 'idle' &&
    !next.items.some((item) => isChatQueueItemActive(item.status))
  if (queueDrained) {
    completions.push({
      type: 'queue-drained',
      queue: next,
      item: null,
    })
  }

  return completions
}

function exactPendingSet(
  queue: ChatQueueResponse,
  orderedItemIds: string[]
): boolean {
  const pendingIds = queue.items
    .filter((item) => item.status === 'pending')
    .map((item) => item.id)
  return (
    pendingIds.length === orderedItemIds.length &&
    new Set(pendingIds).size === new Set(orderedItemIds).size &&
    pendingIds.every((id) => orderedItemIds.includes(id))
  )
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Owns one private session's queue query, mutations, and revisioned SSE cache.
 */
export function useChatQueue(
  sessionId: string | null | undefined,
  options: UseChatQueueOptions = {}
) {
  const queryClient = useQueryClient()
  const activeQueryKey = sessionId ? QUERY_KEYS.chatQueue(sessionId) : null
  const queryKey =
    activeQueryKey ?? (['chat-queue', 'disabled'] as const)
  const onCompletionRef = useRef(options.onCompletion)
  const onStreamErrorRef = useRef(options.onStreamError)
  const historyQueryKeysRef = useRef(options.historyQueryKeys)
  const observedQueueRef = useRef<{
    sessionId: string
    queue: ChatQueueResponse
  } | null>(null)
  const completionKeysRef = useRef(new Set<string>())
  const [streamError, setStreamError] = useState<Error | null>(null)
  const [streamRestartToken, setStreamRestartToken] = useState(0)

  useEffect(() => {
    onCompletionRef.current = options.onCompletion
    onStreamErrorRef.current = options.onStreamError
    historyQueryKeysRef.current = options.historyQueryKeys
  }, [
    options.historyQueryKeys,
    options.onCompletion,
    options.onStreamError,
  ])

  const queueQuery = useQuery<ChatQueueResponse>({
    queryKey,
    queryFn: () => chatQueueApi.get(sessionId!),
    enabled: !!sessionId,
    structuralSharing: (previous, incoming) =>
      mergeChatQueueState(previous as ChatQueueResponse | undefined, {
        kind: 'snapshot',
        queue: incoming as ChatQueueResponse,
      }) ?? (incoming as ChatQueueResponse),
  })

  const restoreOnError = async (
    error: unknown,
    context: OptimisticContext | undefined
  ): Promise<void> => {
    if (!context) {
      return
    }
    const current = queryClient.getQueryData<ChatQueueResponse>(
      context.queryKey
    )
    const cacheAdvanced =
      current !== undefined && current.revision > context.baseRevision
    if (!cacheAdvanced) {
      queryClient.setQueryData(
        context.queryKey,
        context.previous
          ? markLocalQueueState(context.previous)
          : context.previous
      )
    }
    if (cacheAdvanced || isConflictError(error)) {
      await queryClient.invalidateQueries({
        queryKey: context.queryKey,
      })
    }
  }

  useEffect(() => {
    const queue = queueQuery.data
    if (!sessionId || !queue) {
      observedQueueRef.current = null
      return
    }

    const observed = observedQueueRef.current
    observedQueueRef.current = { sessionId, queue }
    if (!observed || observed.sessionId !== sessionId) {
      return
    }

    const completions = queueCompletions(observed.queue, queue).filter(
      (completion) => {
        const revision =
          completion.item?.stream_revision ?? completion.queue.revision
        const subject = completion.item?.id ?? 'queue'
        const key = `${sessionId}:${completion.type}:${subject}:${revision}`
        if (completionKeysRef.current.has(key)) {
          return false
        }
        completionKeysRef.current.add(key)
        return true
      }
    )
    if (completions.length === 0) {
      return
    }

    for (const completion of completions) {
      onCompletionRef.current?.(completion)
    }
    const historyKeys =
      historyQueryKeysRef.current ??
      [QUERY_KEYS.projectChatSession(sessionId)]
    for (const historyKey of historyKeys) {
      void queryClient.invalidateQueries({ queryKey: historyKey })
    }
  }, [queryClient, queueQuery.data, sessionId])

  const enqueueMutation = useMutation<
    ChatQueueItemResponse,
    unknown,
    QueueEnqueueMutation
  >({
    mutationFn: ({ sessionId: mutationSessionId, payload }) =>
      chatQueueApi.enqueue(mutationSessionId, payload),
    retry: 1,
    onSuccess: async (item, variables) => {
      queryClient.setQueryData<ChatQueueResponse>(
        variables.queryKey,
        (current) =>
          mergeChatQueueState(current, { kind: 'item', item })
      )
      // A deferred enqueue (schedule_runner=false) must not GET/ensure yet —
      // that would start a drain while a live AG-UI turn still owns the session.
      if (variables.payload.schedule_runner === false) {
        return
      }
      await queryClient.invalidateQueries({
        queryKey: variables.queryKey,
      })
    },
  })

  const editMutation = useMutation<
    ChatQueueItemResponse,
    unknown,
    QueueItemMutation,
    OptimisticContext
  >({
    mutationFn: ({ sessionId: mutationSessionId, itemId, payload }) =>
      chatQueueApi.updateItem(mutationSessionId, itemId, payload),
    retry: false,
    onMutate: async ({ itemId, payload, queryKey: mutationQueryKey }) => {
      await queryClient.cancelQueries({ queryKey: mutationQueryKey })
      const previous =
        queryClient.getQueryData<ChatQueueResponse>(mutationQueryKey)
      queryClient.setQueryData<ChatQueueResponse>(
        mutationQueryKey,
        (current) =>
          current
            ? markLocalQueueState({
                ...current,
                items: current.items.map((item) =>
                  item.id === itemId
                    ? patchOptimisticItem(item, payload)
                    : item
                ),
              })
            : current
      )
      return {
        previous,
        baseRevision: previous?.revision ?? -1,
        queryKey: mutationQueryKey,
      }
    },
    onSuccess: (item, variables) => {
      queryClient.setQueryData<ChatQueueResponse>(
        variables.queryKey,
        (current) =>
          mergeChatQueueState(current, { kind: 'item', item })
      )
    },
    onError: (error, _variables, context) =>
      restoreOnError(error, context),
  })

  const deleteMutation = useMutation<
    void,
    unknown,
    QueueDeleteMutation,
    OptimisticContext
  >({
    mutationFn: ({ sessionId: mutationSessionId, itemId }) =>
      chatQueueApi.deleteItem(mutationSessionId, itemId),
    retry: false,
    onMutate: async ({ itemId, queryKey: mutationQueryKey }) => {
      await queryClient.cancelQueries({ queryKey: mutationQueryKey })
      const previous =
        queryClient.getQueryData<ChatQueueResponse>(mutationQueryKey)
      queryClient.setQueryData<ChatQueueResponse>(
        mutationQueryKey,
        (current) => {
          if (!current) {
            return current
          }
          const items = current.items
            .filter((item) => item.id !== itemId)
            .map((item, position) => ({ ...item, position }))
          return markLocalQueueState({
            ...current,
            items,
            current_item:
              current.current_item?.id === itemId
                ? null
                : current.current_item,
          })
        }
      )
      return {
        previous,
        baseRevision: previous?.revision ?? -1,
        queryKey: mutationQueryKey,
      }
    },
    onError: (error, _variables, context) =>
      restoreOnError(error, context),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: variables.queryKey,
      })
    },
  })

  const reorderMutation = useMutation<
    ChatQueueResponse,
    unknown,
    QueueReorderMutation,
    OptimisticContext
  >({
    mutationFn: ({
      sessionId: mutationSessionId,
      item_ids,
      expected_revision,
    }) =>
      chatQueueApi.reorder(mutationSessionId, {
        item_ids,
        expected_revision,
      }),
    retry: false,
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: payload.queryKey })
      const previous =
        queryClient.getQueryData<ChatQueueResponse>(payload.queryKey)
      if (
        !previous ||
        previous.revision !== payload.expected_revision ||
        !exactPendingSet(previous, payload.item_ids)
      ) {
        await queryClient.invalidateQueries({ queryKey: payload.queryKey })
        throw new Error('Queue changed before reorder')
      }

      const pendingById = new Map(
        previous.items
          .filter((item) => item.status === 'pending')
          .map((item) => [item.id, item])
      )
      const reordered: ChatQueueItemResponse[] = []
      for (const itemId of payload.item_ids) {
        const item = pendingById.get(itemId)
        if (!item) {
          await queryClient.invalidateQueries({ queryKey: payload.queryKey })
          throw new Error('Queue changed before reorder')
        }
        reordered.push(item)
      }

      queryClient.setQueryData<ChatQueueResponse>(
        payload.queryKey,
        (current) => {
          if (!current) {
            return current
          }
          let pendingIndex = 0
          const items = current.items.map((item) =>
            item.status === 'pending' ? reordered[pendingIndex++] : item
          )
          return markLocalQueueState({
            ...current,
            items: items.map((item, position) => ({ ...item, position })),
          })
        }
      )
      return {
        previous,
        baseRevision: previous.revision,
        queryKey: payload.queryKey,
      }
    },
    onSuccess: (queue, variables) => {
      queryClient.setQueryData<ChatQueueResponse>(
        variables.queryKey,
        (current) =>
          mergeChatQueueState(current, { kind: 'snapshot', queue })
      )
    },
    onError: (error, _variables, context) =>
      restoreOnError(error, context),
  })

  const pauseMutation = useMutation<
    ChatQueueResponse,
    unknown,
    SessionMutation,
    OptimisticContext
  >({
    mutationFn: ({ sessionId: mutationSessionId }) =>
      chatQueueApi.pause(mutationSessionId),
    retry: false,
    onMutate: async ({ queryKey: mutationQueryKey }) => {
      await queryClient.cancelQueries({ queryKey: mutationQueryKey })
      const previous =
        queryClient.getQueryData<ChatQueueResponse>(mutationQueryKey)
      queryClient.setQueryData<ChatQueueResponse>(
        mutationQueryKey,
        (current) =>
          current
            ? markLocalQueueState({ ...current, status: 'paused' })
            : current
      )
      return {
        previous,
        baseRevision: previous?.revision ?? -1,
        queryKey: mutationQueryKey,
      }
    },
    onSuccess: (queue, variables) => {
      queryClient.setQueryData<ChatQueueResponse>(
        variables.queryKey,
        (current) =>
          mergeChatQueueState(current, { kind: 'snapshot', queue })
      )
    },
    onError: (error, _variables, context) =>
      restoreOnError(error, context),
  })

  const resumeMutation = useMutation<
    ChatQueueResponse,
    unknown,
    SessionMutation,
    OptimisticContext
  >({
    mutationFn: ({ sessionId: mutationSessionId }) =>
      chatQueueApi.resume(mutationSessionId),
    retry: false,
    onMutate: async ({ queryKey: mutationQueryKey }) => {
      await queryClient.cancelQueries({ queryKey: mutationQueryKey })
      const previous =
        queryClient.getQueryData<ChatQueueResponse>(mutationQueryKey)
      queryClient.setQueryData<ChatQueueResponse>(
        mutationQueryKey,
        (current) =>
          current
            ? markLocalQueueState({ ...current, status: 'active' })
            : current
      )
      return {
        previous,
        baseRevision: previous?.revision ?? -1,
        queryKey: mutationQueryKey,
      }
    },
    onSuccess: (queue, variables) => {
      queryClient.setQueryData<ChatQueueResponse>(
        variables.queryKey,
        (current) =>
          mergeChatQueueState(current, { kind: 'snapshot', queue })
      )
    },
    onError: (error, _variables, context) =>
      restoreOnError(error, context),
  })

  const retryMutation = useMutation<
    ChatQueueItemResponse,
    unknown,
    QueueDeleteMutation
  >({
    mutationFn: ({ sessionId: mutationSessionId, itemId }) =>
      chatQueueApi.retry(mutationSessionId, itemId),
    retry: false,
    onSuccess: (item, variables) => {
      queryClient.setQueryData<ChatQueueResponse>(
        variables.queryKey,
        (current) =>
          mergeChatQueueState(current, { kind: 'item', item })
      )
    },
  })

  const shouldStream =
    !!queueQuery.data && shouldStreamQueue(queueQuery.data)
  const streamStateKey = queueQuery.data
    ? `${queueQuery.data.status}:${queueQuery.data.runner_state}:${shouldStream}`
    : 'unavailable'

  useEffect(() => {
    if (!sessionId || !shouldStream) {
      setStreamError(null)
      return
    }
    const controller = new AbortController()
    setStreamError(null)
    const currentRevision =
      queryClient.getQueryData<ChatQueueResponse>(
        QUERY_KEYS.chatQueue(sessionId)
      )?.revision

    void chatQueueApi
      .stream(
        sessionId,
        (event) => {
          queryClient.setQueryData<ChatQueueResponse>(
            QUERY_KEYS.chatQueue(sessionId),
            (current) =>
              mergeChatQueueState(current, { kind: 'stream', event })
          )
        },
        {
          afterRevision: currentRevision,
          signal: controller.signal,
        }
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        const normalized = normalizeError(error)
        setStreamError(normalized)
        onStreamErrorRef.current?.(normalized)
      })

    return () => {
      controller.abort()
    }
  }, [
    queryClient,
    sessionId,
    shouldStream,
    streamRestartToken,
    streamStateKey,
  ])

  const restartStream = useCallback(() => {
    setStreamRestartToken((current) => current + 1)
  }, [])

  const enqueueForSession = useCallback(
    (targetSessionId: string, input: ChatQueueEnqueueInput) =>
      enqueueMutation.mutateAsync({
        sessionId: targetSessionId,
        queryKey: QUERY_KEYS.chatQueue(targetSessionId),
        payload: {
          ...input,
          client_request_id: generateChatQueueRequestId(),
        },
      }),
    [enqueueMutation]
  )

  /**
   * Kick drain for an active queue after a live AG-UI turn releases the session.
   * Respects a manual pause — does not auto-resume paused queues.
   */
  const ensureRunner = useCallback(async () => {
    if (!sessionId || !activeQueryKey) {
      return
    }
    let current =
      queryClient.getQueryData<ChatQueueResponse>(activeQueryKey)
    if (!current) {
      current = await chatQueueApi.get(sessionId)
      queryClient.setQueryData(activeQueryKey, current)
    }
    if (current.status === 'paused') {
      return
    }
    // resume() on an already-active queue force-schedules pending drain.
    const queue = await chatQueueApi.resume(sessionId)
    queryClient.setQueryData(
      activeQueryKey,
      (previous: ChatQueueResponse | undefined) =>
        mergeChatQueueState(previous, {
          kind: 'snapshot',
          queue,
        }) ?? queue
    )
  }, [activeQueryKey, queryClient, sessionId])

  const actions = useMemo(
    () => ({
      enqueue: (input: ChatQueueEnqueueInput) => {
        if (!sessionId || !activeQueryKey) {
          return Promise.reject(new Error('A chat session is required'))
        }
        return enqueueForSession(sessionId, input)
      },
      enqueueForSession,
      ensureRunner,
      editItem: (itemId: string, payload: ChatQueueItemUpdatePayload) => {
        if (!sessionId || !activeQueryKey) {
          return Promise.reject(new Error('A chat session is required'))
        }
        return editMutation.mutateAsync({
          sessionId,
          queryKey: activeQueryKey,
          itemId,
          payload,
        })
      },
      deleteItem: (itemId: string) => {
        if (!sessionId || !activeQueryKey) {
          return Promise.reject(new Error('A chat session is required'))
        }
        return deleteMutation.mutateAsync({
          sessionId,
          queryKey: activeQueryKey,
          itemId,
        })
      },
      reorder: (itemIds: string[]) => {
        if (!sessionId || !activeQueryKey) {
          return Promise.reject(new Error('A chat session is required'))
        }
        const queue = queryClient.getQueryData<ChatQueueResponse>(
          activeQueryKey
        )
        if (!queue || !exactPendingSet(queue, itemIds)) {
          return Promise.reject(
            new Error('Reorder must contain the exact pending item set')
          )
        }
        return reorderMutation.mutateAsync({
          sessionId,
          queryKey: activeQueryKey,
          item_ids: itemIds,
          expected_revision: queue.revision,
        })
      },
      pause: () => {
        if (!sessionId || !activeQueryKey) {
          return Promise.reject(new Error('A chat session is required'))
        }
        return pauseMutation.mutateAsync({
          sessionId,
          queryKey: activeQueryKey,
        })
      },
      resume: () => {
        if (!sessionId || !activeQueryKey) {
          return Promise.reject(new Error('A chat session is required'))
        }
        return resumeMutation.mutateAsync({
          sessionId,
          queryKey: activeQueryKey,
        })
      },
      retryItem: (itemId: string) => {
        if (!sessionId || !activeQueryKey) {
          return Promise.reject(new Error('A chat session is required'))
        }
        return retryMutation.mutateAsync({
          sessionId,
          queryKey: activeQueryKey,
          itemId,
        })
      },
    }),
    [
      deleteMutation,
      editMutation,
      enqueueForSession,
      ensureRunner,
      activeQueryKey,
      pauseMutation,
      queryClient,
      reorderMutation,
      resumeMutation,
      retryMutation,
      sessionId,
    ]
  )

  return {
    queue: queueQuery.data,
    query: queueQuery,
    enqueueMutation,
    editMutation,
    deleteMutation,
    reorderMutation,
    pauseMutation,
    resumeMutation,
    retryMutation,
    streamError,
    restartStream,
    ...actions,
  }
}
