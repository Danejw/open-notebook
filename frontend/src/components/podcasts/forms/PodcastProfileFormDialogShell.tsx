'use client'

import { type FormEventHandler, type ReactNode } from 'react'

import { FormDialogShell } from '@/components/common/FormDialogShell'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface PodcastProfileFormDialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  isSubmitting: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
  /** Called when the dialog opens; use to reset form defaults. */
  onOpen?: () => void
  /** Optional content between the header and the form (e.g. alerts). */
  beforeForm?: ReactNode
  disableSubmit?: boolean
  mode?: 'create' | 'edit'
  /** Override the default create-mode save label. */
  createLabel?: string
}

export function PodcastProfileFormDialogShell({
  open,
  onOpenChange,
  title,
  isSubmitting,
  onSubmit,
  children,
  onOpen,
  beforeForm,
  disableSubmit = false,
  mode = 'create',
  createLabel,
}: PodcastProfileFormDialogShellProps) {
  const { t } = useTranslation()
  const isEdit = mode === 'edit'

  const submitLabel = isEdit
    ? t('common.saveChanges')
    : (createLabel ?? t('podcasts.createProfile'))

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
      onOpen={onOpen}
      beforeForm={beforeForm}
      disableSubmit={disableSubmit}
      submitLabel={submitLabel}
      contentClassName="max-w-2xl overflow-y-auto"
    >
      {children}
    </FormDialogShell>
  )
}
