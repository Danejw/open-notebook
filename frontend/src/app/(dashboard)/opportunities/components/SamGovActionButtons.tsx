'use client'

import { Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export interface SamGovActionButtonsProps {
  syncPending: boolean
  onSyncSamGov: () => void
  onOpenImportUrl: () => void
  /** Compact header style hides labels below `sm`. */
  compactLabels?: boolean
  className?: string
}

/**
 * Shared SAM.gov sync + import actions for Opportunity Hub header and empty states.
 */
export function SamGovActionButtons({
  syncPending,
  onSyncSamGov,
  onOpenImportUrl,
  compactLabels = false,
  className,
}: SamGovActionButtonsProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        size="sm"
        variant="outline"
        className={cn(compactLabels && 'h-7 px-2 text-xs')}
        onClick={onOpenImportUrl}
        aria-label={t('opportunities.addSamLinkAriaLabel')}
      >
        <Link2 className={cn('size-3.5', compactLabels ? 'sm:mr-1.5' : 'mr-1.5')} />
        <span className={cn(compactLabels && 'hidden sm:inline')}>
          {t('opportunities.addSamLink')}
        </span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn(compactLabels && 'h-7 px-2 text-xs')}
        disabled={syncPending}
        onClick={onSyncSamGov}
        aria-label={t('opportunities.syncSamGovAriaLabel')}
      >
        <RefreshCw
          className={cn(
            'size-3.5',
            compactLabels ? 'sm:mr-1.5' : 'mr-1.5',
            syncPending && 'animate-spin'
          )}
        />
        <span className={cn(compactLabels && 'hidden sm:inline')}>
          {syncPending
            ? t('opportunities.syncSamGovPending')
            : t('opportunities.syncSamGov')}
        </span>
      </Button>
    </div>
  )
}
