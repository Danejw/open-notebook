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
}

export function TemplatePicker({
  selectedTemplateId,
  onChange,
  disabled = false,
}: TemplatePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: templates, isLoading } = useHtmlTemplates({ enabled: open })

  const selected = Boolean(selectedTemplateId)

  return (
    <ResourcePicker
      selectionMode="single"
      value={selectedTemplateId}
      onChange={onChange}
      onOpenChange={setOpen}
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
      }
    />
  )
}
