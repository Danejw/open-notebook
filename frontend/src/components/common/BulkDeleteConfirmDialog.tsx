'use client'

import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useTranslation } from '@/lib/hooks/use-translation'

interface BulkDeleteConfirmDialogProps {
  ids?: string[] | null
  count?: number
  open?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading?: boolean
  title?: string
}

export function BulkDeleteConfirmDialog({
  ids,
  count: countProp,
  open: openProp,
  onOpenChange,
  onConfirm,
  isLoading = false,
  title: titleProp,
}: BulkDeleteConfirmDialogProps) {
  const { t } = useTranslation()
  const count = countProp ?? ids?.length ?? 0
  const open = openProp ?? Boolean(ids?.length)
  const title = titleProp ?? t('common.delete')

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={t('common.bulkDeleteConfirm').replace('{count}', String(count))}
      confirmText={t('common.delete')}
      confirmVariant="destructive"
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  )
}
