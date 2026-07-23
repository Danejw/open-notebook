'use client'

import type {
  DragEvent,
  HTMLAttributes,
  ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

export interface SourceCardChromeProps {
  rowProps: HTMLAttributes<HTMLDivElement>
  selectedClassName?: string
  className?: string
  showProgressFill: boolean
  fillPercent: number
  isFailed: boolean
  isArtifactDragOver: boolean
  tooltipTitle: string
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  children: ReactNode
}

/**
 * Selection/long-press + drag + progress-fill chrome for SourceCard.
 * Interactive a11y attrs come from useSelectableRow via rowProps.
 */
export function SourceCardChrome({
  rowProps,
  selectedClassName,
  className,
  showProgressFill,
  fillPercent,
  isFailed,
  isArtifactDragOver,
  tooltipTitle,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: SourceCardChromeProps) {
  return (
    <div
      {...rowProps}
      aria-busy={showProgressFill || undefined}
      className={cn(
        'group relative flex flex-col gap-0.5 overflow-hidden rounded-md px-1 py-0.5',
        'cursor-pointer transition-colors select-none',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isFailed && 'bg-destructive/5 hover:bg-destructive/10',
        showProgressFill && 'bg-muted/40',
        isArtifactDragOver && 'ring-2 ring-primary bg-primary/10',
        selectedClassName,
        className
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      title={tooltipTitle}
    >
      {showProgressFill ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-700 ease-out"
          style={{ width: `${fillPercent}%` }}
        />
      ) : null}
      <div className="relative z-[1] flex items-center gap-2 min-w-0">
        {children}
      </div>
    </div>
  )
}
