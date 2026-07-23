'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export type DrawingActionBarProps = {
  inProgress: boolean
  isActive: boolean
  showActivate: boolean
  showRaw: boolean
  retryPending: boolean
  activatePending: boolean
  onRetry: () => void
  onActivate: () => void
  onToggleRaw: () => void
  leading?: ReactNode
}

export function DrawingActionBar({
  inProgress,
  isActive,
  showActivate,
  showRaw,
  retryPending,
  activatePending,
  onRetry,
  onActivate,
  onToggleRaw,
  leading,
}: DrawingActionBarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
      {leading}
      <Button
        size="sm"
        variant="outline"
        disabled={retryPending || inProgress}
        onClick={onRetry}
      >
        {t('sources.drawingRetry')}
      </Button>
      {showActivate && !isActive ? (
        <Button
          size="sm"
          variant="outline"
          disabled={activatePending || inProgress}
          onClick={onActivate}
        >
          {t('sources.drawingActivate')}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onToggleRaw}>
        {showRaw ? t('sources.drawingHideRaw') : t('sources.drawingShowRaw')}
      </Button>
    </div>
  )
}
