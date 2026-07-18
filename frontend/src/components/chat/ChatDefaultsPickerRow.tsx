'use client'

import { type ReactNode } from 'react'
import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { CollectionPicker } from '@/components/collections/CollectionPicker'
import { ToolPicker } from '@/components/mcp/ToolPicker'
import { SkillPicker } from '@/components/skills/SkillPicker'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface ChatDefaultsPickerSlotProps {
  label: string
  children: ReactNode
}

function ChatDefaultsPickerSlot({ label, children }: ChatDefaultsPickerSlotProps) {
  return (
    <div className="flex flex-col items-center justify-end gap-1">
      <Label className="text-center text-[10px] leading-tight text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

export interface ChatDefaultsFieldValues extends FieldValues {
  skill_ids?: string[]
  mcp_tool_ids?: string[]
  collection_ids?: string[]
  html_template_id?: string | null
}

interface ChatDefaultsPickerRowProps<T extends ChatDefaultsFieldValues> {
  control: Control<T>
  disabled?: boolean
  className?: string
}

/**
 * Even four-column row of chat resource pickers (skills, tools, collections, template).
 */
export function ChatDefaultsPickerRow<T extends ChatDefaultsFieldValues>({
  control,
  disabled = false,
  className,
}: ChatDefaultsPickerRowProps<T>) {
  const { t } = useTranslation()

  return (
    <div className={cn('grid grid-cols-4 gap-2', className)}>
      <ChatDefaultsPickerSlot label={t('artifacts.defaultSkills')}>
        <Controller
          control={control}
          name={'skill_ids' as Path<T>}
          render={({ field }) => (
            <SkillPicker
              selectedSkillIds={field.value ?? []}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
      </ChatDefaultsPickerSlot>

      <ChatDefaultsPickerSlot label={t('artifacts.defaultTools')}>
        <Controller
          control={control}
          name={'mcp_tool_ids' as Path<T>}
          render={({ field }) => (
            <ToolPicker
              selectedToolIds={field.value ?? []}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
      </ChatDefaultsPickerSlot>

      <ChatDefaultsPickerSlot label={t('artifacts.defaultCollections')}>
        <Controller
          control={control}
          name={'collection_ids' as Path<T>}
          render={({ field }) => (
            <CollectionPicker
              selectedCollectionIds={field.value ?? []}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
      </ChatDefaultsPickerSlot>

      <ChatDefaultsPickerSlot label={t('artifacts.defaultTemplate')}>
        <Controller
          control={control}
          name={'html_template_id' as Path<T>}
          render={({ field }) => (
            <TemplatePicker
              selectedTemplateId={field.value ?? null}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
      </ChatDefaultsPickerSlot>
    </div>
  )
}
