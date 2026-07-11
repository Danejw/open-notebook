/**
 * Shared AG-UI SSE event types and parser (protocol-first client).
 * Event shapes follow https://docs.ag-ui.com — camelCase wire format.
 */

export type AgUiEventType =
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'STEP_STARTED'
  | 'STEP_FINISHED'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'TEXT_MESSAGE_CHUNK'
  | 'STATE_SNAPSHOT'
  | 'STATE_DELTA'
  | 'MESSAGES_SNAPSHOT'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_ARGS'
  | 'TOOL_CALL_END'
  | 'TOOL_CALL_RESULT'
  | 'CUSTOM'
  | 'RAW'

export interface AgUiEvent {
  type: AgUiEventType | string
  threadId?: string
  runId?: string
  message?: string
  stepName?: string
  messageId?: string
  delta?: string | unknown
  role?: string
  snapshot?: Record<string, unknown>
  name?: string
  value?: unknown
  [key: string]: unknown
}

export type AgUiEventHandler = (event: AgUiEvent) => void

/**
 * Parse an SSE chunk buffer into complete AG-UI events.
 * Returns remaining incomplete buffer text.
 */
export function consumeAgUiSseBuffer(
  buffer: string,
  onEvent: AgUiEventHandler
): string {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''

  for (const line of lines) {
    if (!line.startsWith('data: ')) {
      continue
    }
    const jsonStr = line.slice(6).trim()
    if (!jsonStr) {
      continue
    }
    try {
      const event = JSON.parse(jsonStr) as AgUiEvent
      if (event && typeof event.type === 'string') {
        onEvent(event)
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error('Error parsing AG-UI SSE data:', e, 'Line:', line)
      } else {
        throw e
      }
    }
  }

  return rest
}

export async function readAgUiSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: AgUiEventHandler
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    buffer = consumeAgUiSseBuffer(buffer, onEvent)
  }

  if (buffer.trim()) {
    consumeAgUiSseBuffer(`${buffer}\n`, onEvent)
  }
}

/** Map LangGraph / AG-UI stepName to i18n key under agentSteps.* */
export function agentStepI18nKey(stepName: string): string {
  const aliases: Record<string, string> = {
    agent: 'generating',
    source_chat_agent: 'generating',
    strategy: 'strategy',
    provide_answer: 'provide_answer',
    write_final_answer: 'write_final_answer',
    loading_skills: 'loading_skills',
    retrieving_context: 'retrieving_context',
    building_context: 'building_context',
    provisioning_model: 'provisioning_model',
    generating: 'generating',
  }
  return `agentSteps.${aliases[stepName] ?? stepName}`
}
