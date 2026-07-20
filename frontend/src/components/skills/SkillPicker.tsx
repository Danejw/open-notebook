'use client'

import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResourcePicker } from '@/components/common/ResourcePicker'
import { useSkillsCatalog } from '@/lib/hooks/use-skills'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface SkillPickerProps {
  selectedSkillIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}

export function SkillPicker({
  selectedSkillIds,
  onChange,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: SkillPickerProps) {
  const { t } = useTranslation()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const handleOpenChange = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const { data: catalog, isLoading } = useSkillsCatalog({ enabled: open })

  const activeSkills = useMemo(
    () => (catalog ?? []).filter((skill) => !skill.archived && skill.status !== 'archived'),
    [catalog]
  )

  const selectedCount = selectedSkillIds.length

  return (
    <ResourcePicker
      selectionMode="multi"
      value={selectedSkillIds}
      onChange={onChange}
      open={controlledOpen}
      onOpenChange={handleOpenChange}
      title={t('skills.pickerTitle')}
      items={activeSkills}
      getItemId={(skill) => skill.id}
      getItemProps={(skill) => ({
        title: skill.name,
        description: skill.description || undefined,
      })}
      isLoading={isLoading}
      emptyTitle={t('skills.pickerEmpty')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      formatSelectedCount={(count) =>
        t('skills.pickerSelected').replace('{count}', count.toString())
      }
      trigger={
        showTrigger ? (
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
        ) : undefined
      }
    />
  )
}
