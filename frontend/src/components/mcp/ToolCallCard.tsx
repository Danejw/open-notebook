'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useTranslation } from '@/lib/hooks/use-translation'
import { ChatToolCall } from '@/lib/types/mcp'
import { cn } from '@/lib/utils'

interface ToolCallCardProps {
  toolCall: ChatToolCall
}

function statusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'succeeded':
      return 'secondary'
    case 'running':
    case 'requested':
      return 'default'
    case 'failed':
    case 'rejected':
      return 'destructive'
    default:
      return 'outline'
  }
}

function formatJson(value: object | null | undefined): string {
  if (!value) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const isNative = toolCall.tool_source === 'native'
  const label =
    !isNative && toolCall.connection_name
      ? `${toolCall.connection_name} · ${toolCall.tool_name}`
      : toolCall.tool_name

  return (
    <Card className="border-dashed bg-muted/30 py-0 shadow-none">
      <CardHeader className="px-2 py-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Wrench className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium truncate">{label}</span>
              <Badge variant={statusBadgeVariant(toolCall.status)} className="h-4 px-1 text-[10px]">
                {t(`tools.toolCallStatus.${toolCall.status}`, toolCall.status)}
              </Badge>
              {isNative && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {t('tools.source.native', 'native')}
                </Badge>
              )}
              {toolCall.performed_write && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {t('tools.performedWrite', 'wrote data')}
                </Badge>
              )}
              {toolCall.risk_level && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {t(`tools.risk.${toolCall.risk_level}`, toolCall.risk_level)}
                </Badge>
              )}
            </div>
          </div>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-2 p-2 pt-1 text-xs">
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">{t('tools.toolCallArgs')}</p>
              <pre className="max-h-40 overflow-auto rounded-md border bg-background p-2 font-mono text-[11px]">
                {formatJson(toolCall.arguments)}
              </pre>
            </div>
          )}
          {toolCall.result_text && (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">{t('tools.toolCallResult')}</p>
              <pre
                className={cn(
                  'max-h-48 overflow-auto rounded-md border bg-background p-2 font-mono text-[11px] whitespace-pre-wrap'
                )}
              >
                {toolCall.result_text}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <p className="mb-1 font-medium text-destructive">{t('tools.toolCallError')}</p>
              <pre className="max-h-32 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 font-mono text-[11px] whitespace-pre-wrap text-destructive">
                {toolCall.error}
              </pre>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
