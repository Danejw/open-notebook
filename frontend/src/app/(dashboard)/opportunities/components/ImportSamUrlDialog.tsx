'use client'

import type { FormEvent } from 'react'
import {
  FormDialogShell,
  formDialogFormClassName,
} from '@/components/common/FormDialogShell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface ImportSamUrlDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  importUrl: string
  onImportUrlChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
}

export function ImportSamUrlDialog({
  open,
  onOpenChange,
  importUrl,
  onImportUrlChange,
  onSubmit,
  isSubmitting,
}: ImportSamUrlDialogProps) {
  const { t } = useTranslation()

  return (
    <FormDialogShell
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          onImportUrlChange('')
        }
      }}
      title={t('opportunities.importDialogTitle')}
      description={t('opportunities.importDialogDescription')}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      disableSubmit={!importUrl.trim()}
      submitLabel={t('opportunities.importSubmitLabel')}
      submittingLabel={t('opportunities.importSubmittingLabel')}
      compactFooter
    >
      <div className={formDialogFormClassName}>
        <div className="space-y-1.5">
          <Label htmlFor="sam-opportunity-url">
            {t('opportunities.importUrlLabel')}
          </Label>
          <Input
            id="sam-opportunity-url"
            type="url"
            value={importUrl}
            onChange={(event) => onImportUrlChange(event.target.value)}
            placeholder={t('opportunities.importUrlPlaceholder')}
            autoFocus
            disabled={isSubmitting}
          />
        </div>
      </div>
    </FormDialogShell>
  )
}
