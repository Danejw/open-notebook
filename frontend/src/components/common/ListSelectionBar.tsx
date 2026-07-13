'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface ListSelectionBarProps {
  count: number
  countLabel: string
  onClear: () => void
  onSelectAll?: () => void
  className?: string
  children?: ReactNode
}

export function ListSelectionBar({
  count,
  countLabel,
  onClear,
  onSelectAll,
  className,
  children,
}: ListSelectionBarProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'sticky top-0 z-20 mb-1 flex flex-wrap items-center gap-2 rounded-md border bg-muted/80 px-2 py-1.5 backdrop-blur',
        className
      )}
      role="toolbar"
      aria-label={countLabel}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={onClear}
        aria-label={t('common.clearSelection')}
      >
        <X className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium">{countLabel}</span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {onSelectAll && (
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onSelectAll}>
            {t('common.selectAll')}
          </Button>
        )}
        {children}
      </div>
    </div>
  )
}
