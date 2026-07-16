import type { AgUiEvent } from '@/lib/ag-ui/events'
import type { ChatToolCall, ToolSource } from '@/lib/types/mcp'

export const MCP_TOOL_CALL_EVENT = 'mcp_tool_call'
/** Future-neutral alias; parser accepts both event names. */
export const TOOL_CALL_EVENT = 'tool_call'

function displayToolName(toolName: string, runtimeName?: string | null): string {
  const raw = toolName || runtimeName || ''
  if (raw.startsWith('native__')) {
    return raw.slice('native__'.length)
  }
  return raw
}

function parseToolSource(value: unknown): ToolSource | null {
  if (value === 'native' || value === 'mcp') {
    return value
  }
  return null
}

export function parseMcpToolCallEvent(event: AgUiEvent): ChatToolCall | null {
  if (event.name !== MCP_TOOL_CALL_EVENT && event.name !== TOOL_CALL_EVENT) {
    return null
  }
  const value = event.value
  if (!value || typeof value !== 'object') {
    return null
  }
  const data = value as Record<string, unknown>
  if (typeof data.tool_name !== 'string' || typeof data.status !== 'string') {
    return null
  }
  const runtimeName =
    data.runtime_name != null ? String(data.runtime_name) : null
  const toolSource =
    parseToolSource(data.tool_source) ||
    (runtimeName?.startsWith('native__') ? 'native' : 'mcp')
  return {
    id: String(data.id ?? `live-${Date.now()}`),
    session_id: String(data.session_id ?? ''),
    message_id: data.message_id != null ? String(data.message_id) : null,
    connection_id: data.connection_id != null ? String(data.connection_id) : null,
    tool_id: data.tool_id != null ? String(data.tool_id) : null,
    tool_name: displayToolName(data.tool_name, runtimeName),
    connection_name:
      data.connection_name != null ? String(data.connection_name) : null,
    risk_level: data.risk_level != null ? String(data.risk_level) : null,
    runtime_name: runtimeName,
    arguments:
      data.arguments && typeof data.arguments === 'object'
        ? (data.arguments as object)
        : null,
    result_text: data.result_text != null ? String(data.result_text) : null,
    status: data.status,
    error: data.error != null ? String(data.error) : null,
    tool_source: toolSource,
    performed_write: Boolean(data.performed_write),
    error_category:
      data.error_category != null ? String(data.error_category) : null,
    started_at: data.started_at != null ? String(data.started_at) : null,
    completed_at: data.completed_at != null ? String(data.completed_at) : null,
    duration_ms:
      typeof data.duration_ms === 'number' ? data.duration_ms : null,
    created: data.created != null ? String(data.created) : null,
    updated: data.updated != null ? String(data.updated) : null,
  }
}

export function upsertMcpToolCall(
  calls: ChatToolCall[],
  update: ChatToolCall
): ChatToolCall[] {
  const index = calls.findIndex((call) => call.id === update.id)
  if (index === -1) {
    return [...calls, update]
  }
  const next = [...calls]
  next[index] = { ...next[index], ...update }
  return next
}

export function mergeMcpToolCalls(
  persisted: ChatToolCall[],
  live: ChatToolCall[]
): ChatToolCall[] {
  const byId = new Map<string, ChatToolCall>()
  for (const call of persisted) {
    byId.set(call.id, call)
  }
  for (const call of live) {
    const existing = byId.get(call.id)
    byId.set(call.id, existing ? { ...existing, ...call } : call)
  }
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = a.created ?? ''
    const bTime = b.created ?? ''
    return aTime.localeCompare(bTime)
  })
}

export function groupToolCallsByMessage<
  T extends { id: string; type: string }
>(messages: T[], toolCalls: ChatToolCall[]): Map<string, ChatToolCall[]> {
  const map = new Map<string, ChatToolCall[]>()
  const aiMessages = messages.filter((message) => message.type === 'ai')
  const fallbackAiId =
    aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].id : null

  for (const call of toolCalls) {
    const messageId = call.message_id || fallbackAiId
    if (!messageId) {
      continue
    }
    const existing = map.get(messageId) ?? []
    map.set(messageId, [...existing, call])
  }
  return map
}
