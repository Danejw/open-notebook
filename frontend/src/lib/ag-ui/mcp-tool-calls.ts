import type { AgUiEvent } from '@/lib/ag-ui/events'
import type { ChatToolCall } from '@/lib/types/mcp'

export const MCP_TOOL_CALL_EVENT = 'mcp_tool_call'

export function parseMcpToolCallEvent(event: AgUiEvent): ChatToolCall | null {
  if (event.name !== MCP_TOOL_CALL_EVENT) {
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
  return {
    id: String(data.id ?? `live-${Date.now()}`),
    session_id: String(data.session_id ?? ''),
    message_id: data.message_id != null ? String(data.message_id) : null,
    connection_id: data.connection_id != null ? String(data.connection_id) : null,
    tool_id: data.tool_id != null ? String(data.tool_id) : null,
    tool_name: data.tool_name,
    connection_name:
      data.connection_name != null ? String(data.connection_name) : null,
    risk_level: data.risk_level != null ? String(data.risk_level) : null,
    runtime_name: data.runtime_name != null ? String(data.runtime_name) : null,
    arguments:
      data.arguments && typeof data.arguments === 'object'
        ? (data.arguments as object)
        : null,
    result_text: data.result_text != null ? String(data.result_text) : null,
    status: data.status,
    error: data.error != null ? String(data.error) : null,
    created: data.created != null ? String(data.created) : null,
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
