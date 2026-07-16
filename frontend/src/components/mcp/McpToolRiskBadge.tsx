'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { McpTool } from '@/lib/types/mcp'

export type McpToolRiskLevel = McpTool['risk_level']

export function mcpToolRiskBadgeVariant(
  risk: McpToolRiskLevel
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (risk) {
    case 'read':
      return 'secondary'
    case 'action':
      return 'destructive'
    case 'unknown':
      return 'outline'
    default: {
      const _exhaustive: never = risk
      return _exhaustive
    }
  }
}

interface McpToolRiskBadgeProps {
  risk: McpToolRiskLevel
  className?: string
}

/** Shared risk-level badge for MCP tool lists and detail pages. */
export function McpToolRiskBadge({ risk, className }: McpToolRiskBadgeProps) {
  const { t } = useTranslation()

  return (
    <Badge variant={mcpToolRiskBadgeVariant(risk)} className={className}>
      {t(`tools.risk.${risk}`)}
    </Badge>
  )
}
