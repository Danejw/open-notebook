'use client'

import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
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
  const [open, setOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>(selectedSkillIds)
  const { data: catalog, isLoading } = useSkillsCatalog({ enabled: open })

  const activeSkills = useMemo(
    () => (catalog ?? []).filter((skill) => !skill.archived && skill.status !== 'archived'),
    [catalog]
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftIds(selectedSkillIds)
    }
    setOpen(nextOpen)
  }

  const toggleSkill = (id: string, checked: boolean) => {
    setDraftIds((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id]
      }
      return prev.filter((skillId) => skillId !== id)
    })
  }

  const handleSave = () => {
    onChange(draftIds)
    setOpen(false)
  }

  const selectedCount = selectedSkillIds.length
  const draftCount = draftIds.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-0.5 border-b px-3 py-2">
          <DialogTitle className="text-sm font-semibold leading-none">
            {t('skills.pickerTitle')}
          </DialogTitle>
          <DialogDescription className="text-[11px] leading-snug">
            {t('skills.pickerDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto hide-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner />
            </div>
          ) : activeSkills.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('skills.pickerEmpty')}
            </p>
          ) : (
            <div className="divide-y">
              {activeSkills.map((skill) => {
                const checked = draftIds.includes(skill.id)
                const checkboxId = `skill-picker-${skill.id}`
                return (
                  <label
                    key={skill.id}
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-muted/50"
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
        </div>

        <DialogFooter className="flex-row items-center gap-2 border-t px-3 py-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {draftCount > 0
              ? t('skills.pickerSelected').replace('{count}', draftCount.toString())
              : '\u00a0'}
          </span>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={handleSave}>
              {t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
