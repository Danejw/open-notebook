'use client'

import { useEffect, type FormEventHandler, type ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'

/** Default spacing for form fields inside rename/edit dialogs. */
export const formDialogFormClassName = 'space-y-3 px-1 py-1'

export interface FormDialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  isSubmitting?: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
  /** Called when the dialog opens; use to reset form defaults. */
  onOpen?: () => void
  /** Optional trigger button rendered via DialogTrigger. */
  trigger?: ReactNode
  /** Optional content between the header and the form (e.g. alerts). */
  beforeForm?: ReactNode
  /** Optional left-side footer content (e.g. reset action). */
  footerLeft?: ReactNode
  disableSubmit?: boolean
  /** Primary submit label when not submitting. Defaults to common.save. */
  submitLabel?: string
  /** Label while submitting. Defaults to common.saving. */
  submittingLabel?: string
  contentClassName?: string
  formClassName?: string
  footerClassName?: string
  /** Compact footer buttons (size="sm" h-7) used on templates/images pages. */
  compactFooter?: boolean
}

export function FormDialogShell({
  open,
  onOpenChange,
  title,
  description,
  isSubmitting = false,
  onSubmit,
  children,
  onOpen,
  trigger,
  beforeForm,
  footerLeft,
  disableSubmit = false,
  submitLabel,
  submittingLabel,
  contentClassName,
  formClassName,
  footerClassName,
  compactFooter = false,
}: FormDialogShellProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) {
      return
    }
    onOpen?.()
  }, [open, onOpen])

  const saveLabel = isSubmitting
    ? (submittingLabel ?? t('common.saving'))
    : (submitLabel ?? t('common.save'))

  const footerButtonProps = compactFooter
    ? ({ size: 'sm' as const, className: 'h-7' })
    : {}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {beforeForm}

        <form
          onSubmit={onSubmit}
          className={cn(formDialogFormClassName, formClassName)}
        >
          {children}

          <DialogFooter
            className={cn(
              'pt-2',
              footerLeft && 'sm:justify-between',
              footerClassName
            )}
          >
            {footerLeft}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                {...footerButtonProps}
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                {...footerButtonProps}
                disabled={disableSubmit || isSubmitting}
              >
                {saveLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
