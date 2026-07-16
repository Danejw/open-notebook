'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface PageRefreshButtonProps {
  onClick: () => void
  disabled?: boolean
  showLabel?: boolean
  label?: string
  isLoading?: boolean
  className?: string
  labelClassName?: string
  iconClassName?: string
}

export function PageRefreshButton({
  onClick,
  disabled,
  showLabel = false,
  label,
  isLoading = false,
  className,
  labelClassName,
  iconClassName,
}: PageRefreshButtonProps) {
  const { t } = useTranslation()
  const refreshLabel = label ?? t('common.refresh')

  if (showLabel) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={onClick}
        disabled={disabled || isLoading}
      >
        {isLoading ? (
          <InlineSkeleton className={cn('mr-2', iconClassName)} />
        ) : (
          <RefreshCw className={cn('h-3.5 w-3.5', iconClassName)} />
        )}
        <span className={labelClassName}>{refreshLabel}</span>
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('h-7 w-7 p-0', className)}
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-label={refreshLabel}
    >
      {isLoading ? (
        <InlineSkeleton />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}
