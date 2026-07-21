'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ChatToolCall } from '@/lib/types/mcp'
import { cn } from '@/lib/utils'
import { McpToolRiskBadge } from '@/components/mcp/McpToolRiskBadge'
import {
  isActiveToolCallStatus,
  TOOL_CALL_ROW_CLASS,
  TOOL_CALL_SHELL_CLASS,
  toolCallLabel,
} from '@/components/mcp/tool-call-display'
import type { McpRiskLevel } from '@/lib/types/mcp'

interface ToolCallCardProps {
  toolCall: ChatToolCall
  /** Flatten chrome when nested inside ToolCallGroup. */
  embedded?: boolean
}

function formatJson(value: object | null | undefined): string {
  if (!value) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function ToolCallCard({ toolCall, embedded = false }: ToolCallCardProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const label = toolCallLabel(toolCall)
  const active = isActiveToolCallStatus(toolCall.status)
  const statusMeta =
    toolCall.status === 'succeeded'
      ? null
      : t(`tools.toolCallStatus.${toolCall.status}`, toolCall.status)
  const writeMeta = toolCall.performed_write
    ? t('tools.performedWrite', 'wrote data')
    : null
  const metaParts = [statusMeta, writeMeta].filter(Boolean)
  const riskLevel = toolCall.risk_level
  const showRiskBadge = riskLevel === 'action' || riskLevel === 'unknown'

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className={cn(!embedded && TOOL_CALL_SHELL_CLASS)}
    >
      <CollapsibleTrigger type="button" className={TOOL_CALL_ROW_CLASS}>
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {active ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Wrench className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {label}
        </span>
        {metaParts.length > 0 || showRiskBadge ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {metaParts.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {metaParts.join(' · ')}
              </span>
            ) : null}
            {showRiskBadge ? (
              <McpToolRiskBadge
                risk={riskLevel as McpRiskLevel}
                className="text-[10px]"
              />
            ) : null}
          </span>
        ) : null}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-1 border-t border-border/50 px-1 py-0.5 text-xs">
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <p className="mb-0.5 text-[11px] text-muted-foreground">
                {t('tools.toolCallArgs')}
              </p>
              <pre className="max-h-40 overflow-auto rounded-md border bg-background p-1 font-mono text-[11px]">
                {formatJson(toolCall.arguments)}
              </pre>
            </div>
          )}
          {toolCall.result_text && (
            <div>
              <p className="mb-0.5 text-[11px] text-muted-foreground">
                {t('tools.toolCallResult')}
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-1 font-mono text-[11px]">
                {toolCall.result_text}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <p className="mb-0.5 text-[11px] text-destructive">
                {t('tools.toolCallError')}
              </p>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-1 font-mono text-[11px] text-destructive">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
