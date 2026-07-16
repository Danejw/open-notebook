'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmText?: string
  confirmVariant?: 'default' | 'destructive'
  onConfirm: () => void
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmVariant = 'default',
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const finalConfirmText = confirmText || t('common.confirm')

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    // DropdownMenu → AlertDialog combos can leave body.pointerEvents = 'none'.
    if (!nextOpen && typeof document !== 'undefined') {
      document.body.style.pointerEvents = ''
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Prevent Radix from racing close with DropdownMenu teardown, which
              // can leave document.body.style.pointerEvents = 'none'.
              event.preventDefault()
              onConfirm()
              handleOpenChange(false)
            }}
            disabled={isLoading}
            className={
              confirmVariant === 'destructive'
                ? buttonVariants({ variant: 'destructive' })
                : undefined
            }
          >
            {isLoading ? (
              <>
                <InlineSkeleton className="mr-2" />
                {finalConfirmText}
              </>
            ) : (
              finalConfirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}