'use client'

import { useMemo, type ReactNode } from 'react'
import { ChevronDown, FileCode2, Library, Settings2, Sparkles, Wrench, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useHtmlTemplate } from '@/lib/hooks/use-html-documents'
import { useModels } from '@/lib/hooks/use-models'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ChatAttachPicker } from '@/components/source/ChatComposerAttachMenu'
import { cn } from '@/lib/utils'

export interface ChatComposerSelectionIndicatorsProps {
  disabled?: boolean
  modelOverride?: string
  onModelChange?: (model?: string) => void
  selectedSkillIds?: string[]
  onSkillIdsChange?: (ids: string[]) => void
  selectedCollectionIds?: string[]
  onCollectionIdsChange?: (ids: string[]) => void
  selectedHtmlTemplateId?: string | null
  onHtmlTemplateIdChange?: (id: string | null) => void
  selectedMcpToolIds?: string[]
  onMcpToolIdsChange?: (ids: string[]) => void
  onOpenPicker: (picker: Exclude<ChatAttachPicker, null>) => void
  /** Show a down-caret that scrolls the transcript to the latest message. */
  showJumpToBottom?: boolean
  onJumpToBottom?: () => void
}

function SelectionChip({
  icon,
  label,
  tooltip,
  disabled,
  onOpen,
  onClear,
  clearLabel,
}: {
  icon: ReactNode
  label: string
  tooltip: string
  disabled?: boolean
  onOpen: () => void
  onClear: () => void
  clearLabel: string
}) {
  return (
    <div
      className={cn(
        'inline-flex h-6 max-w-[9rem] items-center rounded-md border border-border/80 bg-background/80 text-[11px] text-muted-foreground'
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={onOpen}
            className="inline-flex min-w-0 items-center gap-0.5 px-1.5 py-0 hover:text-foreground disabled:opacity-50"
            aria-label={tooltip}
          >
            <span className="shrink-0 text-primary">{icon}</span>
            <span className="truncate">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className="size-5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
        aria-label={clearLabel}
        title={clearLabel}
        onClick={(e) => {
          e.stopPropagation()
          onClear()
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

export function ChatComposerSelectionIndicators({
  disabled = false,
  modelOverride,
  onModelChange,
  selectedSkillIds,
  onSkillIdsChange,
  selectedCollectionIds,
  onCollectionIdsChange,
  selectedHtmlTemplateId,
  onHtmlTemplateIdChange,
  selectedMcpToolIds,
  onMcpToolIdsChange,
  onOpenPicker,
  showJumpToBottom = false,
  onJumpToBottom,
}: ChatComposerSelectionIndicatorsProps) {
  const { t } = useTranslation()
  const { data: models } = useModels()
  const { data: htmlTemplate } = useHtmlTemplate(
    selectedHtmlTemplateId ?? undefined
  )

  const modelName = useMemo(() => {
    if (!modelOverride) return null
    return (
      models?.find((model) => model.id === modelOverride)?.name ?? modelOverride
    )
  }, [modelOverride, models])

  const skillCount = selectedSkillIds?.length ?? 0
  const toolCount = selectedMcpToolIds?.length ?? 0
  const collectionCount = selectedCollectionIds?.length ?? 0
  const hasTemplate = Boolean(selectedHtmlTemplateId)
  const showModel = Boolean(onModelChange && modelOverride)
  const showSkills = Boolean(onSkillIdsChange && skillCount > 0)
  const showTools = Boolean(onMcpToolIdsChange && toolCount > 0)
  const showCollections = Boolean(onCollectionIdsChange && collectionCount > 0)
  const showTemplate = Boolean(onHtmlTemplateIdChange && hasTemplate)
  const hasChips =
    showModel || showSkills || showTools || showCollections || showTemplate

  if (!hasChips && !showJumpToBottom) {
    return null
  }

  const jumpLabel = t('chat.scrollToLatest', 'Scroll to latest')

  return (
    <div
      className="flex min-w-0 items-center gap-0.5 px-0.5 pb-0.5"
      data-testid="chat-composer-selection-indicators"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
        {showModel ? (
          <SelectionChip
            icon={<Settings2 className="size-3" />}
            label={modelName ?? modelOverride!}
            tooltip={t('common.modelConfiguration')}
            disabled={disabled}
            onOpen={() => onOpenPicker('model')}
            onClear={() => onModelChange?.(undefined)}
            clearLabel={t('common.resetToDefault')}
          />
        ) : null}
        {showSkills ? (
          <SelectionChip
            icon={<Sparkles className="size-3" />}
            label={String(skillCount)}
            tooltip={t('skills.pickerSelected').replace(
              '{count}',
              String(skillCount)
            )}
            disabled={disabled}
            onOpen={() => onOpenPicker('skills')}
            onClear={() => onSkillIdsChange?.([])}
            clearLabel={t('common.clearSelection')}
          />
        ) : null}
        {showTools ? (
          <SelectionChip
            icon={<Wrench className="size-3" />}
            label={String(toolCount)}
            tooltip={t('tools.pickerSelected').replace(
              '{count}',
              String(toolCount)
            )}
            disabled={disabled}
            onOpen={() => onOpenPicker('tools')}
            onClear={() => onMcpToolIdsChange?.([])}
            clearLabel={t('common.clearSelection')}
          />
        ) : null}
        {showCollections ? (
          <SelectionChip
            icon={<Library className="size-3" />}
            label={String(collectionCount)}
            tooltip={t('collections.pickerSelected').replace(
              '{count}',
              String(collectionCount)
            )}
            disabled={disabled}
            onOpen={() => onOpenPicker('collections')}
            onClear={() => onCollectionIdsChange?.([])}
            clearLabel={t('common.clearSelection')}
          />
        ) : null}
        {showTemplate ? (
          <SelectionChip
            icon={<FileCode2 className="size-3" />}
            label={htmlTemplate?.name ?? t('templates.pickerLabel')}
            tooltip={
              htmlTemplate?.name
                ? htmlTemplate.name
                : t('templates.pickerSelected')
            }
            disabled={disabled}
            onOpen={() => onOpenPicker('templates')}
            onClear={() => onHtmlTemplateIdChange?.(null)}
            clearLabel={t('templates.pickerClear')}
          />
        ) : null}
      </div>
      {showJumpToBottom ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-6 shrink-0"
              aria-label={jumpLabel}
              onClick={onJumpToBottom}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{jumpLabel}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
