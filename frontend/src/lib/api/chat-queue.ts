import { z } from 'zod'
import apiClient, { getAuthToken, handleUnauthorizedResponse } from '@/lib/api/client'
import type {
  ChatQueueItemEnqueuePayload,
  ChatQueueItemResponse,
  ChatQueueItemUpdatePayload,
  ChatQueueReorderPayload,
  ChatQueueResponse,
  ChatQueueStreamEvent,
} from '@/lib/types/chat-queue'

const metadataSchema = z.record(z.string(), z.unknown())
/** Accept FastAPI timestamps with or without a timezone offset. */
const dateTimeSchema = z.union([
  z.iso.datetime({ offset: true }),
  z.iso.datetime({ local: true }),
])

const executionSnapshotSchema = z
  .object({
    model_id: z.string().nullable(),
    skill_ids: z.array(z.string()).nullable(),
    collection_ids: z.array(z.string()).nullable(),
    tool_ids: z.array(z.string()).nullable(),
    html_template_id: z.string().nullable(),
    artifact_id: z.string().nullable(),
    context_config: metadataSchema.nullable(),
    forwarded_props: metadataSchema.nullable(),
  })
  .strict()

const queueItemSchema: z.ZodType<ChatQueueItemResponse> = z
  .object({
    id: z.string(),
    queue_id: z.string(),
    chat_session: z.string(),
    client_request_id: z.string(),
    run_id: z.string(),
    position: z.number().int(),
    status: z.enum([
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled',
    ]),
    visible: z.boolean(),
    prompt: z.string(),
    loop_count: z.number().int(),
    current_loop: z.number().int(),
    iteration_token: z.string().nullable(),
    execution_snapshot: executionSnapshotSchema,
    runner_command_id: z.string().nullable(),
    runner_state: z.enum([
      'idle',
      'scheduled',
      'running',
      'completed',
      'failed',
    ]),
    stream_revision: z.number().int().nonnegative(),
    stream_content: z.string(),
    stream_progress: metadataSchema.nullable(),
    stream_activity: metadataSchema.nullable(),
    error_type: z.string().nullable(),
    error_message: z.string().nullable(),
    error_details: metadataSchema.nullable(),
    started_at: dateTimeSchema.nullable(),
    completed_at: dateTimeSchema.nullable(),
    failed_at: dateTimeSchema.nullable(),
    created: dateTimeSchema,
    updated: dateTimeSchema,
  })
  .strict()

const queueSchema: z.ZodType<ChatQueueResponse> = z
  .object({
    id: z.string(),
    chat_session: z.string(),
    status: z.enum(['active', 'paused']),
    revision: z.number().int().nonnegative(),
    runner_state: z.enum(['idle', 'scheduled', 'running']),
    runner_command_id: z.string().nullable(),
    lease_owner: z.string().nullable(),
    lease_expires_at: dateTimeSchema.nullable(),
    items: z.array(queueItemSchema),
    current_item: queueItemSchema.nullable(),
    created: dateTimeSchema,
    updated: dateTimeSchema,
  })
  .strict()

const snapshotStreamEventSchema = z
  .object({
    event: z.enum(['snapshot', 'queue']),
    revision: z.number().int().nonnegative(),
    queue: queueSchema,
    item: z.null(),
  })
  .strict()

const itemStreamEventSchema = z
  .object({
    event: z.literal('item'),
    revision: z.number().int().nonnegative(),
    queue: z.null(),
    item: queueItemSchema,
  })
  .strict()

const heartbeatStreamEventSchema = z
  .object({
    event: z.literal('heartbeat'),
    revision: z.number().int().nonnegative(),
    queue: z.null(),
    item: z.null(),
  })
  .strict()

const streamEventSchema: z.ZodType<ChatQueueStreamEvent> =
  z.discriminatedUnion('event', [
    snapshotStreamEventSchema,
    itemStreamEventSchema,
    heartbeatStreamEventSchema,
  ])

const DEFAULT_RECONNECT_BASE_DELAY_MS = 250
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5_000

export interface ChatQueueSseMetadata {
  id: string | null
  eventName: string | null
}

export interface ChatQueueStreamOptions {
  signal?: AbortSignal
  afterRevision?: number
  reconnectBaseDelayMs?: number
  reconnectMaxDelayMs?: number
}

export type ChatQueueStreamHandler = (
  event: ChatQueueStreamEvent,
  metadata: ChatQueueSseMetadata
) => void

/**
 * Error returned by a queue stream HTTP response.
 */
export class ChatQueueHttpError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ChatQueueHttpError'
    this.status = status
    this.retryable = status === 408 || status === 429 || status >= 500
  }
}

/**
 * Strictly validates a queue response received from the backend.
 */
export function parseChatQueueResponse(value: unknown): ChatQueueResponse {
  return queueSchema.parse(value)
}

/**
 * Strictly validates a queue item response received from the backend.
 */
export function parseChatQueueItemResponse(
  value: unknown
): ChatQueueItemResponse {
  return queueItemSchema.parse(value)
}

/**
 * Strictly validates one revisioned queue stream event.
 */
export function parseChatQueueStreamEvent(
  value: unknown
): ChatQueueStreamEvent {
  return streamEventSchema.parse(value)
}

function parseSseFrame(
  frame: string,
  onEvent: ChatQueueStreamHandler
): void {
  const dataLines: string[] = []
  let id: string | null = null
  let eventName: string | null = null

  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) {
      continue
    }
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }

    switch (field) {
      case 'data':
        dataLines.push(value)
        break
      case 'event':
        eventName = value
        break
      case 'id':
        if (!value.includes('\0')) {
          id = value
        }
        break
      case 'retry':
        break
      default:
        break
    }
  }

  if (dataLines.length === 0) {
    return
  }

  let event: ChatQueueStreamEvent
  try {
    const parsed = JSON.parse(dataLines.join('\n')) as unknown
    event = parseChatQueueStreamEvent(parsed)
  } catch {
    // A malformed frame is isolated so later valid revisions remain consumable.
    return
  }

  if (
    eventName !== event.event ||
    id === null ||
    !/^(0|[1-9]\d*)$/.test(id)
  ) {
    return
  }
  const numericId = Number(id)
  if (!Number.isSafeInteger(numericId) || numericId !== event.revision) {
    return
  }

  onEvent(event, { eventName, id })
}

/**
 * Consumes complete SSE frames and returns the trailing incomplete buffer.
 */
export function consumeChatQueueSseBuffer(
  buffer: string,
  onEvent: ChatQueueStreamHandler
): string {
  let remaining = buffer

  while (true) {
    const delimiter = /\r?\n\r?\n/.exec(remaining)
    if (!delimiter || delimiter.index === undefined) {
      return remaining
    }
    const frame = remaining.slice(0, delimiter.index)
    remaining = remaining.slice(delimiter.index + delimiter[0].length)
    parseSseFrame(frame, onEvent)
  }
}

function queuePath(sessionId: string): string {
  return `/chat/sessions/${encodeURIComponent(sessionId)}/queue`
}

function streamUrl(sessionId: string, afterRevision?: number): string {
  const base = `/api${queuePath(sessionId)}/stream`
  return afterRevision === undefined
    ? base
    : `${base}?after_revision=${afterRevision}`
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function isRetryableStreamError(error: unknown): boolean {
  if (error instanceof ChatQueueHttpError) {
    return error.retryable
  }
  return error instanceof TypeError
}

async function sleepWithAbort(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    return
  }
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, delayMs)
    signal?.addEventListener('abort', finish, { once: true })
  })
}

async function responseError(response: Response): Promise<ChatQueueHttpError> {
  let message = response.statusText || `Queue stream failed (${response.status})`
  try {
    const payload = (await response.json()) as {
      detail?: unknown
      message?: unknown
    }
    if (typeof payload.detail === 'string') {
      message = payload.detail
    } else if (typeof payload.message === 'string') {
      message = payload.message
    }
  } catch {
    // Preserve the HTTP status fallback when the body is not JSON.
  }
  return new ChatQueueHttpError(message, response.status)
}

interface StreamReadResult {
  afterRevision: number | undefined
  lastEventId: string | undefined
  receivedEvent: boolean
}

async function readQueueStream(
  response: Response,
  onEvent: ChatQueueStreamHandler,
  initialRevision: number | undefined,
  signal?: AbortSignal
): Promise<StreamReadResult> {
  if (!response.body) {
    throw new ChatQueueHttpError('Queue stream returned no body', 502)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let afterRevision = initialRevision
  let lastEventId: string | undefined
  let receivedEvent = false

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      buffer = consumeChatQueueSseBuffer(buffer, (event, metadata) => {
        receivedEvent = true
        afterRevision = Math.max(afterRevision ?? 0, event.revision)
        if (metadata.id) {
          lastEventId = metadata.id
        }
        onEvent(event, metadata)
      })
    }
    buffer += decoder.decode()
    if (!signal?.aborted && buffer.trim()) {
      consumeChatQueueSseBuffer(`${buffer}\n\n`, (event, metadata) => {
        receivedEvent = true
        afterRevision = Math.max(afterRevision ?? 0, event.revision)
        if (metadata.id) {
          lastEventId = metadata.id
        }
        onEvent(event, metadata)
      })
    }
  } finally {
    if (signal?.aborted) {
      await reader.cancel()
    }
    reader.releaseLock()
  }

  return { afterRevision, lastEventId, receivedEvent }
}

/**
 * Streams queue snapshots and reconnects from the latest persisted revision.
 */
export async function streamChatQueue(
  sessionId: string,
  onEvent: ChatQueueStreamHandler,
  options: ChatQueueStreamOptions = {}
): Promise<void> {
  const baseDelay = Math.max(
    0,
    options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS
  )
  const maxDelay = Math.max(
    baseDelay,
    options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
  )
  let afterRevision = options.afterRevision
  let lastEventId: string | undefined
  let retryAttempt = 0

  while (!options.signal?.aborted) {
    try {
      const token = getAuthToken()
      const response = await fetch(streamUrl(sessionId, afterRevision), {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        },
        cache: 'no-store',
        signal: options.signal,
      })
      if (!response.ok) {
        if (response.status === 401) {
          handleUnauthorizedResponse()
        }
        throw await responseError(response)
      }
      const contentType = response.headers
        .get('content-type')
        ?.split(';', 1)[0]
        .trim()
        .toLowerCase()
      if (contentType !== 'text/event-stream') {
        throw new ChatQueueHttpError(
          'Queue stream returned an invalid content type',
          response.status
        )
      }

      const result = await readQueueStream(
        response,
        onEvent,
        afterRevision,
        options.signal
      )
      afterRevision = result.afterRevision
      lastEventId = result.lastEventId ?? lastEventId
      retryAttempt = result.receivedEvent ? 0 : retryAttempt + 1
    } catch (error) {
      if (isAbortError(error, options.signal)) {
        return
      }
      if (!isRetryableStreamError(error)) {
        throw error
      }
      retryAttempt += 1
    }

    const delay = Math.min(
      maxDelay,
      baseDelay * 2 ** Math.max(0, retryAttempt - 1)
    )
    await sleepWithAbort(delay, options.signal)
  }
}

export const chatQueueApi = {
  /** Fetches one session's queue snapshot. */
  get: async (sessionId: string): Promise<ChatQueueResponse> => {
    const response = await apiClient.get<unknown>(queuePath(sessionId))
    return parseChatQueueResponse(response.data)
  },

  /** Idempotently adds an item to one session queue. */
  enqueue: async (
    sessionId: string,
    payload: ChatQueueItemEnqueuePayload
  ): Promise<ChatQueueItemResponse> => {
    const response = await apiClient.post<unknown>(
      `${queuePath(sessionId)}/items`,
      payload
    )
    return parseChatQueueItemResponse(response.data)
  },

  /** Updates mutable fields on a pending or failed item. */
  updateItem: async (
    sessionId: string,
    itemId: string,
    payload: ChatQueueItemUpdatePayload
  ): Promise<ChatQueueItemResponse> => {
    const response = await apiClient.patch<unknown>(
      `${queuePath(sessionId)}/items/${encodeURIComponent(itemId)}`,
      payload
    )
    return parseChatQueueItemResponse(response.data)
  },

  /** Removes a pending or failed item. */
  deleteItem: async (sessionId: string, itemId: string): Promise<void> => {
    await apiClient.delete(
      `${queuePath(sessionId)}/items/${encodeURIComponent(itemId)}`
    )
  },

  /** Reorders the exact pending item set at an expected revision. */
  reorder: async (
    sessionId: string,
    payload: ChatQueueReorderPayload
  ): Promise<ChatQueueResponse> => {
    const response = await apiClient.put<unknown>(
      `${queuePath(sessionId)}/order`,
      payload
    )
    return parseChatQueueResponse(response.data)
  },

  /** Pauses future item claims without interrupting current execution. */
  pause: async (sessionId: string): Promise<ChatQueueResponse> => {
    const response = await apiClient.patch<unknown>(queuePath(sessionId), {
      status: 'paused',
    })
    return parseChatQueueResponse(response.data)
  },

  /** Resumes pending queue execution. */
  resume: async (sessionId: string): Promise<ChatQueueResponse> => {
    const response = await apiClient.patch<unknown>(queuePath(sessionId), {
      status: 'active',
    })
    return parseChatQueueResponse(response.data)
  },

  /** Retries a failed queue item. */
  retry: async (
    sessionId: string,
    itemId: string
  ): Promise<ChatQueueItemResponse> => {
    const response = await apiClient.post<unknown>(
      `${queuePath(sessionId)}/items/${encodeURIComponent(itemId)}/retry`
    )
    return parseChatQueueItemResponse(response.data)
  },

  /** Opens a reconnectable, abortable queue SSE stream. */
  stream: streamChatQueue,
}
