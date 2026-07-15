'use client'

import { useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  const [open, setOpen] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(selectedTemplateId)
  const { data: templates, isLoading } = useHtmlTemplates({ enabled: open })

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftId(selectedTemplateId)
    }
    setOpen(nextOpen)
  }

  const handleSave = () => {
    onChange(draftId)
    setOpen(false)
  }

  const selected = Boolean(selectedTemplateId)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent className="max-h-[70vh] max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b">
          <DialogTitle>{t('templates.pickerTitle')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto hide-scrollbar">
          {isLoading ? (
            <PickerDialogSkeleton rows={4} />
          ) : !templates?.length ? (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">
              {t('templates.pickerEmpty')}
            </p>
          ) : (
            <div className="divide-y">
              {templates.map((template) => {
                const checked = draftId === template.id
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
                      onChange={() => setDraftId(template.id)}
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
        </div>

        <DialogFooter className="flex-row items-center border-t sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setDraftId(null)}
            disabled={!draftId}
          >
            {t('templates.pickerClear')}
          </Button>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen(false)}
            >
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
