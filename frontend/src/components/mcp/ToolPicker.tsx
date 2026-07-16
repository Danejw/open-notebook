'use client'

import { useMemo } from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/common/EmptyState'
import { PickerCheckboxRow } from '@/components/common/PickerCheckboxRow'
import {
  PickerDialogActions,
  PickerDialogShell,
  usePickerDialogDraft,
} from '@/components/common/PickerDialogShell'
import { PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
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
  const { open, draft, setDraft, handleOpenChange, close } =
    usePickerDialogDraft(selectedToolIds)
  const { data: tools, isLoading } = useMcpSelectableTools({ enabled: open })

  const groupedTools = useMemo(() => {
    const groups = new Map<string, { connectionName: string; tools: McpTool[] }>()
    for (const tool of tools ?? []) {
      const key = tool.connection_id ?? 'unknown'
      const connectionName = tool.connection_name ?? t('tools.unknownConnection')
      const existing = groups.get(key)
      if (existing) {
        existing.tools.push(tool)
      } else {
        groups.set(key, { connectionName, tools: [tool] })
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.connectionName.localeCompare(b.connectionName)
    )
  }, [tools, t])

  const toggleTool = (id: string, checked: boolean) => {
    setDraft((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id]
      }
      return prev.filter((toolId) => toolId !== id)
    })
  }

  const handleSave = () => {
    onChange(draft)
    close()
  }

  const selectedCount = selectedToolIds.length
  const draftCount = draft.length

  return (
    <PickerDialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title={t('tools.pickerTitle')}
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
      footerLeft={
        <span className="text-[11px] text-muted-foreground">
          {draftCount > 0
            ? t('tools.pickerSelected').replace('{count}', draftCount.toString())
            : '\u00a0'}
        </span>
      }
      afterBody={
        draft.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t px-3 py-3">
            {draft.map((id) => {
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
      actions={
        <PickerDialogActions
          cancelLabel={t('common.cancel')}
          saveLabel={t('common.save')}
          onCancel={close}
          onSave={handleSave}
        />
      }
    >
      {isLoading ? (
        <PickerDialogSkeleton rows={5} />
      ) : groupedTools.length === 0 ? (
        <EmptyState
          variant="subtle"
          title={t('tools.pickerEmpty')}
          className="py-4"
          titleClassName="text-xs"
        />
      ) : (
        <div className="space-y-3 px-1 py-1">
          {groupedTools.map((group) => (
            <div key={group.connectionName} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.connectionName}
              </p>
              <div className="space-y-1.5">
                {group.tools.map((tool) => {
                  const selectable = isToolSelectable(tool)
                  return (
                    <PickerCheckboxRow
                      key={tool.id}
                      id={tool.id}
                      bordered
                      title={tool.title || tool.name}
                      description={tool.description || undefined}
                      checked={draft.includes(tool.id)}
                      disabled={!selectable}
                      onCheckedChange={(checked) => toggleTool(tool.id, checked)}
                      meta={
                        <McpToolRiskBadge
                          risk={tool.risk_level}
                          className="text-[10px]"
                        />
                      }
                      footer={
                        !selectable ? (
                          <p className="text-xs text-muted-foreground">
                            {tool.risk_level !== 'read'
                              ? t('tools.pickerReadOnlyNote')
                              : t('tools.pickerUnavailableNote')}
                          </p>
                        ) : null
                      }
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PickerDialogShell>
  )
}
