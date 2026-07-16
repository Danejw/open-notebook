'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ToolCallCard } from '@/components/mcp/ToolCallCard'
import {
  getCollapsedFocusToolCall,
  isActiveToolCallStatus,
  TOOL_CALL_ROW_CLASS,
  TOOL_CALL_SHELL_CLASS,
  toolCallLabel,
} from '@/components/mcp/tool-call-display'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ChatToolCall } from '@/lib/types/mcp'
import { cn } from '@/lib/utils'

interface ToolCallGroupProps {
  toolCalls: ChatToolCall[]
  className?: string
  /** When true, start expanded. Default collapsed. */
  defaultOpen?: boolean
}

export { getCollapsedFocusToolCall } from '@/components/mcp/tool-call-display'

/**
 * Higher-level collapsible for a turn's tool-call list.
 * Collapsed: one dense row with the in-flight (or latest) tool + count.
 * Expanded: same-style rows for each call.
 */
export function ToolCallGroup({
  toolCalls,
  className,
  defaultOpen = false,
}: ToolCallGroupProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)

  const focusCall = useMemo(
    () => getCollapsedFocusToolCall(toolCalls),
    [toolCalls]
  )
  const isActive = focusCall
    ? isActiveToolCallStatus(focusCall.status)
    : false
  const failedCount = toolCalls.filter(
    (call) => call.status === 'failed' || call.status === 'rejected'
  ).length

  if (toolCalls.length === 0) {
    return null
  }

  // Single call: same full-width shell as the multi-call group.
  if (toolCalls.length === 1) {
    return (
      <div className={cn('w-full self-stretch', className)}>
        <ToolCallCard toolCall={toolCalls[0]} />
      </div>
    )
  }

  const focusLabel = focusCall ? toolCallLabel(focusCall) : ''
  const countLabel = t('tools.toolCallsCount', '{count} tools').replace(
    '{count}',
    String(toolCalls.length)
  )
  const metaParts = [
    countLabel,
    failedCount > 0
      ? `${t('tools.toolCallStatus.failed', 'Failed')} ${failedCount}`
      : null,
  ].filter(Boolean)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(TOOL_CALL_SHELL_CLASS, className)}
    >
      <CollapsibleTrigger type="button" className={TOOL_CALL_ROW_CLASS}>
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {isActive ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Wrench className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {focusLabel}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {metaParts.join(' · ')}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border/50">
        <div className="divide-y divide-border/40">
          {toolCalls.map((toolCall) => (
            <ToolCallCard key={toolCall.id} toolCall={toolCall} embedded />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
