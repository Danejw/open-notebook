'use client'

import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/common/EmptyState'
import {
  PickerDialogActions,
  PickerDialogShell,
  usePickerDialogDraft,
} from '@/components/common/PickerDialogShell'
import { PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
import { useSkillsCatalog } from '@/lib/hooks/use-skills'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface SkillPickerProps {
  selectedSkillIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function SkillPicker({ selectedSkillIds, onChange, disabled = false }: SkillPickerProps) {
  const { t } = useTranslation()
  const { open, draft, setDraft, handleOpenChange, close } =
    usePickerDialogDraft(selectedSkillIds)
  const { data: catalog, isLoading } = useSkillsCatalog({ enabled: open })

  const activeSkills = useMemo(
    () => (catalog ?? []).filter((skill) => !skill.archived && skill.status !== 'archived'),
    [catalog]
  )

  const toggleSkill = (id: string, checked: boolean) => {
    setDraft((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id]
      }
      return prev.filter((skillId) => skillId !== id)
    })
  }

  const handleSave = () => {
    onChange(draft)
    close()
  }

  const selectedCount = selectedSkillIds.length
  const draftCount = draft.length

  return (
    <PickerDialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title={t('skills.pickerTitle')}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          disabled={disabled}
          aria-label={t('skills.pickerLabel')}
          title={
            selectedCount > 0
              ? t('skills.pickerSelected').replace('{count}', selectedCount.toString())
              : t('skills.pickerLabel')
          }
        >
          <Sparkles className={cn('h-4 w-4', selectedCount > 0 && 'text-primary')} />
        </Button>
      }
      footerLeft={
        <span className="text-[11px] text-muted-foreground">
          {draftCount > 0
            ? t('skills.pickerSelected').replace('{count}', draftCount.toString())
            : '\u00a0'}
        </span>
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
        <PickerDialogSkeleton rows={4} />
      ) : activeSkills.length === 0 ? (
        <EmptyState variant="subtle" title={t('skills.pickerEmpty')} titleClassName="text-xs" />
      ) : (
        <div className="divide-y">
          {activeSkills.map((skill) => {
            const checked = draft.includes(skill.id)
            const checkboxId = `skill-picker-${skill.id}`
            return (
              <label
                key={skill.id}
                htmlFor={checkboxId}
                className="flex cursor-pointer items-start gap-2 px-1 py-1.5 hover:bg-muted/50"
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  className="mt-0.5"
                  onCheckedChange={(value) => toggleSkill(skill.id, value === true)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-snug">
                    {skill.name}
                  </span>
                  {skill.description ? (
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {skill.description}
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </PickerDialogShell>
  )
}
