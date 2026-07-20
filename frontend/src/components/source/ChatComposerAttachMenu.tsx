'use client'

import { useEffect, useState } from 'react'
import {
  FileCode2,
  Library,
  Plus,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChatModelOverrideDialog } from '@/components/source/ChatModelOverrideDialog'
import { SkillPicker } from '@/components/skills/SkillPicker'
import { CollectionPicker } from '@/components/collections/CollectionPicker'
import { ToolPicker } from '@/components/mcp/ToolPicker'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import { useTranslation } from '@/lib/hooks/use-translation'
import { clearBodyPointerLock } from '@/lib/utils/clear-body-pointer-lock'
import { cn } from '@/lib/utils'

export type ChatAttachPicker =
  | 'model'
  | 'skills'
  | 'tools'
  | 'collections'
  | 'templates'
  | null

export interface ChatComposerAttachMenuProps {
  disabled?: boolean
  compact?: boolean
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
  /** Controlled picker dialog (shared with selection indicators). */
  activePicker?: ChatAttachPicker
  onActivePickerChange?: (picker: ChatAttachPicker) => void
}

export function ChatComposerAttachMenu({
  disabled = false,
  compact = true,
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
  activePicker: controlledPicker,
  onActivePickerChange,
}: ChatComposerAttachMenuProps) {
  const { t } = useTranslation()
  const [uncontrolledPicker, setUncontrolledPicker] =
    useState<ChatAttachPicker>(null)

  const isControlled = onActivePickerChange !== undefined
  const activePicker = isControlled
    ? (controlledPicker ?? null)
    : uncontrolledPicker

  const setActivePicker = (picker: ChatAttachPicker) => {
    if (isControlled) {
      onActivePickerChange?.(picker)
    } else {
      setUncontrolledPicker(picker)
    }
  }

  const hasModel = Boolean(onModelChange)
  const hasSkills = Boolean(onSkillIdsChange)
  const hasTools = Boolean(onMcpToolIdsChange)
  const hasCollections = Boolean(onCollectionIdsChange)
  const hasTemplates = Boolean(onHtmlTemplateIdChange)

  useEffect(() => {
    if (activePicker === null) {
      clearBodyPointerLock()
    }
  }, [activePicker])

  if (!hasModel && !hasSkills && !hasTools && !hasCollections && !hasTemplates) {
    return null
  }

  const hasSelection =
    Boolean(modelOverride) ||
    (selectedSkillIds?.length ?? 0) > 0 ||
    (selectedMcpToolIds?.length ?? 0) > 0 ||
    (selectedCollectionIds?.length ?? 0) > 0 ||
    Boolean(selectedHtmlTemplateId)

  const openPickerFromMenu = (picker: Exclude<ChatAttachPicker, null>) => {
    // Let the dropdown finish unmounting before the dialog locks focus/pointer.
    window.setTimeout(() => {
      clearBodyPointerLock()
      setActivePicker(picker)
    }, 0)
  }

  const closePicker = () => {
    setActivePicker(null)
    clearBodyPointerLock()
    window.setTimeout(clearBodyPointerLock, 0)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className={cn(
              'flex-shrink-0',
              compact ? 'h-8 w-8' : 'h-11 w-11 rounded-xl',
              hasSelection && 'border-primary/50 text-primary'
            )}
            aria-label={t('common.add')}
            title={t('common.add')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          {hasModel ? (
            <DropdownMenuItem
              onSelect={() => openPickerFromMenu('model')}
              className="gap-2"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t('common.modelConfiguration')}
            </DropdownMenuItem>
          ) : null}
          {hasSkills ? (
            <DropdownMenuItem
              onSelect={() => openPickerFromMenu('skills')}
              className="gap-2"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('skills.pickerTitle')}
            </DropdownMenuItem>
          ) : null}
          {hasTools ? (
            <DropdownMenuItem
              onSelect={() => openPickerFromMenu('tools')}
              className="gap-2"
            >
              <Wrench className="h-3.5 w-3.5" />
              {t('tools.pickerTitle')}
            </DropdownMenuItem>
          ) : null}
          {hasCollections ? (
            <DropdownMenuItem
              onSelect={() => openPickerFromMenu('collections')}
              className="gap-2"
            >
              <Library className="h-3.5 w-3.5" />
              {t('collections.pickerTitle')}
            </DropdownMenuItem>
          ) : null}
          {hasTemplates ? (
            <DropdownMenuItem
              onSelect={() => openPickerFromMenu('templates')}
              className="gap-2"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              {t('templates.pickerTitle')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasModel ? (
        <ChatModelOverrideDialog
          currentModel={modelOverride}
          onModelChange={onModelChange!}
          disabled={disabled}
          showTrigger={false}
          open={activePicker === 'model'}
          onOpenChange={(next) => {
            if (!next) closePicker()
          }}
        />
      ) : null}
      {hasSkills ? (
        <SkillPicker
          selectedSkillIds={selectedSkillIds ?? []}
          onChange={onSkillIdsChange!}
          disabled={disabled}
          showTrigger={false}
          open={activePicker === 'skills'}
          onOpenChange={(next) => {
            if (!next) closePicker()
          }}
        />
      ) : null}
      {hasTools ? (
        <ToolPicker
          selectedToolIds={selectedMcpToolIds ?? []}
          onChange={onMcpToolIdsChange!}
          disabled={disabled}
          showTrigger={false}
          open={activePicker === 'tools'}
          onOpenChange={(next) => {
            if (!next) closePicker()
          }}
        />
      ) : null}
      {hasCollections ? (
        <CollectionPicker
          selectedCollectionIds={selectedCollectionIds ?? []}
          onChange={onCollectionIdsChange!}
          disabled={disabled}
          showTrigger={false}
          open={activePicker === 'collections'}
          onOpenChange={(next) => {
            if (!next) closePicker()
          }}
        />
      ) : null}
      {hasTemplates ? (
        <TemplatePicker
          selectedTemplateId={selectedHtmlTemplateId ?? null}
          onChange={onHtmlTemplateIdChange!}
          disabled={disabled}
          showTrigger={false}
          open={activePicker === 'templates'}
          onOpenChange={(next) => {
            if (!next) closePicker()
          }}
        />
      ) : null}
    </>
  )
}

/** Open a picker without racing a closing dropdown (for selection chips). */
export function openChatAttachPicker(
  setActivePicker: (picker: ChatAttachPicker) => void,
  picker: Exclude<ChatAttachPicker, null>
): void {
  clearBodyPointerLock()
  setActivePicker(picker)
}
