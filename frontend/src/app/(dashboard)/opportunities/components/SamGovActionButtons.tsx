'use client'

import { Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        size="sm"
        variant="outline"
        className={cn(compactLabels && 'h-7 px-2 text-xs')}
        onClick={onOpenImportUrl}
        aria-label="Add SAM.gov opportunity by URL"
      >
        <Link2 className={cn('size-3.5', compactLabels ? 'sm:mr-1.5' : 'mr-1.5')} />
        <span className={cn(compactLabels && 'hidden sm:inline')}>
          Add SAM.gov link
        </span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn(compactLabels && 'h-7 px-2 text-xs')}
        disabled={syncPending}
        onClick={onSyncSamGov}
        aria-label="Sync SAM.gov opportunities"
      >
        <RefreshCw
          className={cn(
            'size-3.5',
            compactLabels ? 'sm:mr-1.5' : 'mr-1.5',
            syncPending && 'animate-spin'
          )}
        />
        <span className={cn(compactLabels && 'hidden sm:inline')}>
          {syncPending ? 'Syncing SAM.gov…' : 'Sync SAM.gov'}
        </span>
      </Button>
    </div>
  )
}
