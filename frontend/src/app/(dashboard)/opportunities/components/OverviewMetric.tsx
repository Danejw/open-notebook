'use client'

import { cn } from '@/lib/utils'

export function OverviewMetric({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string | number
  warning?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-[4.5rem] shrink-0 flex-1 px-1.5 py-1 lg:min-w-0',
        warning && 'rounded-sm bg-destructive/10'
      )}
    >
      <div
        className={cn(
          'truncate text-sm font-semibold leading-none tabular-nums',
          warning && 'text-destructive'
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          'mt-0.5 truncate text-[10px] text-muted-foreground',
          warning && 'text-destructive/80'
        )}
      >
        {label}
      </div>
    </div>
  )
}

