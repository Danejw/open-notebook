'use client'

import { useMemo, useState } from 'react'
import { BookMarked, Sparkles } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked className="h-4 w-4" />
            {t('skills.pickerTitle')}
          </DialogTitle>
          <DialogDescription>{t('skills.pickerDesc')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-3 overflow-y-auto py-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : activeSkills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('skills.pickerEmpty')}
            </p>
          ) : (
            activeSkills.map((skill) => {
              const checked = draftIds.includes(skill.id)
              const checkboxId = `skill-picker-${skill.id}`
              return (
                <div key={skill.id} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    onCheckedChange={(value) => toggleSkill(skill.id, value === true)}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={checkboxId} className="cursor-pointer font-medium">
                      {skill.name}
                    </Label>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {skill.description}
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

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
