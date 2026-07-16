'use client'

import { FileCode2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import {
  PickerDialogActions,
  PickerDialogShell,
  usePickerDialogDraft,
} from '@/components/common/PickerDialogShell'
import { PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
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
  const { open, draft, setDraft, handleOpenChange, close } =
    usePickerDialogDraft(selectedTemplateId)
  const { data: templates, isLoading } = useHtmlTemplates({ enabled: open })

  const handleSave = () => {
    onChange(draft)
    close()
  }

  const selected = Boolean(selectedTemplateId)

  return (
    <PickerDialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title={t('templates.pickerTitle')}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          disabled={disabled}
          aria-label={t('templates.pickerLabel')}
          title={
            selected
              ? t('templates.pickerSelected')
              : t('templates.pickerLabel')
          }
        >
          <FileCode2 className={cn('h-4 w-4', selected && 'text-primary')} />
        </Button>
      }
      footerLeft={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setDraft(null)}
          disabled={!draft}
        >
          {t('templates.pickerClear')}
        </Button>
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
      ) : !templates?.length ? (
        <EmptyState variant="subtle" title={t('templates.pickerEmpty')} titleClassName="text-xs" />
      ) : (
        <div className="divide-y">
          {templates.map((template) => {
            const checked = draft === template.id
            const radioId = `template-picker-${template.id}`
            return (
              <label
                key={template.id}
                htmlFor={radioId}
                className="flex cursor-pointer items-start gap-2 px-1 py-1.5 hover:bg-muted/50"
              >
                <input
                  id={radioId}
                  type="radio"
                  name="html-template-picker"
                  className="mt-1"
                  checked={checked}
                  onChange={() => setDraft(template.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-snug">
                    {template.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {template.category}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      )}
    </PickerDialogShell>
  )
}
