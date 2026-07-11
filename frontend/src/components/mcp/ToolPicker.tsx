'use client'

import { useMemo, useState } from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
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

function riskBadgeVariant(risk: McpTool['risk_level']): 'default' | 'secondary' | 'destructive' | 'outline' {
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

export function ToolPicker({ selectedToolIds, onChange, disabled = false }: ToolPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>(selectedToolIds)
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

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftIds(selectedToolIds)
    }
    setOpen(nextOpen)
  }

  const toggleTool = (id: string, checked: boolean) => {
    setDraftIds((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id]
      }
      return prev.filter((toolId) => toolId !== id)
    })
  }

  const handleSave = () => {
    onChange(draftIds)
    setOpen(false)
  }

  const selectedCount = selectedToolIds.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            {t('tools.pickerTitle')}
          </DialogTitle>
          <DialogDescription>{t('tools.pickerDesc')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-4 overflow-y-auto py-2">
          {isLoading ? (
            <PickerDialogSkeleton rows={5} />
          ) : groupedTools.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('tools.pickerEmpty')}
            </p>
          ) : (
            groupedTools.map((group) => (
              <div key={group.connectionName} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.connectionName}
                </p>
                <div className="space-y-2">
                  {group.tools.map((tool) => {
                    const selectable = isToolSelectable(tool)
                    const checked = draftIds.includes(tool.id)
                    const checkboxId = `tool-picker-${tool.id}`
                    return (
                      <div
                        key={tool.id}
                        className={cn(
                          'flex items-start gap-3 rounded-md border p-3',
                          !selectable && 'opacity-60'
                        )}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          disabled={!selectable}
                          onCheckedChange={(value) => toggleTool(tool.id, value === true)}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Label
                              htmlFor={checkboxId}
                              className={cn(
                                'font-medium',
                                selectable ? 'cursor-pointer' : 'cursor-not-allowed'
                              )}
                            >
                              {tool.title || tool.name}
                            </Label>
                            <Badge variant={riskBadgeVariant(tool.risk_level)} className="text-[10px]">
                              {t(`tools.risk.${tool.risk_level}`)}
                            </Badge>
                          </div>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                          {!selectable && (
                            <p className="text-xs text-muted-foreground">
                              {tool.risk_level !== 'read'
                                ? t('tools.pickerReadOnlyNote')
                                : t('tools.pickerUnavailableNote')}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {draftIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
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
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
