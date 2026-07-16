'use client'

import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ResourcePicker } from '@/components/common/ResourcePicker'
import { McpToolRiskBadge } from '@/components/mcp/McpToolRiskBadge'
import { useMcpSelectableTools } from '@/lib/hooks/use-mcp'
import { useTranslation } from '@/lib/hooks/use-translation'
import { McpTool } from '@/lib/types/mcp'
import { cn } from '@/lib/utils'

interface ToolPickerProps {
  selectedToolIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

function isToolSelectable(tool: McpTool): boolean {
  return tool.available && tool.executable && tool.risk_level === 'read'
}

export function ToolPicker({ selectedToolIds, onChange, disabled = false }: ToolPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: tools, isLoading } = useMcpSelectableTools({ enabled: open })

  const selectedCount = selectedToolIds.length

  return (
    <ResourcePicker
      selectionMode="multi"
      value={selectedToolIds}
      onChange={onChange}
      onOpenChange={setOpen}
      title={t('tools.pickerTitle')}
      items={tools ?? []}
      getItemId={(tool) => tool.id}
      groupBy={(tool) => ({
        key: tool.connection_id ?? 'unknown',
        label: tool.connection_name ?? t('tools.unknownConnection'),
      })}
      getItemProps={(tool) => {
        const selectable = isToolSelectable(tool)
        return {
          bordered: true,
          title: tool.title || tool.name,
          description: tool.description || undefined,
          disabled: !selectable,
          meta: <McpToolRiskBadge risk={tool.risk_level} className="text-[10px]" />,
          footer: !selectable ? (
            <p className="text-xs text-muted-foreground">
              {tool.risk_level !== 'read'
                ? t('tools.pickerReadOnlyNote')
                : t('tools.pickerUnavailableNote')}
            </p>
          ) : null,
        }
      }}
      isLoading={isLoading}
      emptyTitle={t('tools.pickerEmpty')}
      emptyClassName="py-4"
      skeletonRows={5}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      formatSelectedCount={(count) =>
        t('tools.pickerSelected').replace('{count}', count.toString())
      }
      afterBody={({ draftIds }) =>
        draftIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t px-3 py-3">
            {draftIds.map((id) => {
              const tool = tools?.find((item) => item.id === id)
              if (!tool) return null
              return (
                <Badge key={id} variant="secondary" className="text-xs">
                  {tool.connection_name ? `${tool.connection_name}: ` : ''}
                  {tool.title || tool.name}
                </Badge>
              )
            })}
          </div>
        ) : undefined
      }
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          disabled={disabled}
          aria-label={t('tools.pickerLabel')}
          title={
            selectedCount > 0
              ? t('tools.pickerSelected').replace('{count}', selectedCount.toString())
              : t('tools.pickerLabel')
          }
        >
          <Wrench className={cn('h-4 w-4', selectedCount > 0 && 'text-primary')} />
        </Button>
      }
    />
  )
}
