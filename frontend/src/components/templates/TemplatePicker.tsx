'use client'

import { useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResourcePicker } from '@/components/common/ResourcePicker'
import { useHtmlTemplates } from '@/lib/hooks/use-html-documents'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface TemplatePickerProps {
  selectedTemplateId: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}

export function TemplatePicker({
  selectedTemplateId,
  onChange,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: TemplatePickerProps) {
  const { t } = useTranslation()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const handleOpenChange = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const { data: templates, isLoading } = useHtmlTemplates({ enabled: open })

  const selected = Boolean(selectedTemplateId)

  return (
    <ResourcePicker
      selectionMode="single"
      value={selectedTemplateId}
      onChange={onChange}
      open={controlledOpen}
      onOpenChange={handleOpenChange}
      title={t('templates.pickerTitle')}
      items={templates ?? []}
      getItemId={(template) => template.id}
      getItemProps={(template) => ({
        title: template.name,
        description: template.category,
      })}
      isLoading={isLoading}
      emptyTitle={t('templates.pickerEmpty')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      clearLabel={t('templates.pickerClear')}
      trigger={
        showTrigger ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            disabled={disabled}
            aria-label={t('templates.pickerLabel')}
            title={selected ? t('templates.pickerSelected') : t('templates.pickerLabel')}
          >
            <FileCode2 className={cn('h-4 w-4', selected && 'text-primary')} />
          </Button>
        ) : undefined
      }
    />
  )
}
