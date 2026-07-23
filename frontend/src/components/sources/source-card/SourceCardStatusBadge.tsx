'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SourceCardStatusBadgeProps {
  visible: boolean
  colorClassName: string
  icon: LucideIcon
  isProcessing: boolean
  label: string
  title: string
}

/** Compact pipeline-stage badge shown while extract is in progress. */
export function SourceCardStatusBadge({
  visible,
  colorClassName,
  icon: StatusIcon,
  isProcessing,
  label,
  title,
}: SourceCardStatusBadgeProps) {
  if (!visible) return null

  return (
    <span
      className={cn(
        'mr-1 inline-flex max-w-[9.5rem] items-center gap-1 truncate text-[11px] font-medium',
        colorClassName
      )}
      title={title}
    >
      <StatusIcon className={cn('h-3 w-3 shrink-0', isProcessing && 'animate-pulse')} />
      <span className="hidden truncate sm:inline">{label}</span>
    </span>
  )
}
