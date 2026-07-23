'use client'

import type { FormEvent } from 'react'
import { FormDialogShell, formDialogFormClassName } from '@/components/common/FormDialogShell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  return (
    <FormDialogShell
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          onImportUrlChange('')
        }
      }}
      title="Add SAM.gov link"
      description="Paste a sam.gov opportunity URL. We fetch the notice and add it to this inbox like a sync result."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      disableSubmit={!importUrl.trim()}
      submitLabel="Add opportunity"
      submittingLabel="Importing…"
      compactFooter
    >
      <div className={formDialogFormClassName}>
        <div className="space-y-1.5">
          <Label htmlFor="sam-opportunity-url">Opportunity URL</Label>
          <Input
            id="sam-opportunity-url"
            type="url"
            value={importUrl}
            onChange={(event) => onImportUrlChange(event.target.value)}
            placeholder="https://sam.gov/workspace/contract/opp/…/view"
            autoFocus
            disabled={isSubmitting}
          />
        </div>
      </div>
    </FormDialogShell>
  )
}
