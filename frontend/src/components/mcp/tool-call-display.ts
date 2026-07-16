import type { ChatToolCall } from '@/lib/types/mcp'

const ACTIVE_STATUSES = new Set(['running', 'requested'])

export function isActiveToolCallStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status)
}

/** Prefer in-flight tool; otherwise the most recent call for the collapsed summary. */
export function getCollapsedFocusToolCall(
  toolCalls: ChatToolCall[]
): ChatToolCall | null {
  if (toolCalls.length === 0) return null
  const active =
    toolCalls.find((call) => call.status === 'running') ??
    toolCalls.find((call) => call.status === 'requested')
  if (active) return active
  return toolCalls[toolCalls.length - 1] ?? null
}

export function toolCallLabel(toolCall: ChatToolCall): string {
  if (toolCall.tool_source !== 'native' && toolCall.connection_name) {
    return `${toolCall.connection_name} · ${toolCall.tool_name}`
  }
  return toolCall.tool_name
}

/** Shared chrome for tool-call group + standalone card shells. */
export const TOOL_CALL_SHELL_CLASS =
  'w-full self-stretch rounded-md border border-dashed border-border/60 bg-muted/20'

/** Shared trigger row density for group header and card rows. */
export const TOOL_CALL_ROW_CLASS =
  'flex w-full min-h-7 items-center gap-1 px-1 py-0.5 text-left hover:bg-muted/40'
