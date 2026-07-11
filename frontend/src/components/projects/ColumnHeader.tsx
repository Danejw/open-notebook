'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ColumnHeaderProps {
  title: string
  actions?: ReactNode
  className?: string
}

/**
 * Shared compact header for project column panels (Sources, Notes, Chat).
 * Uses a plain div — not CardHeader — to avoid shadcn's [.border-b]:pb-6 default.
 */
export function ColumnHeader({ title, actions, className }: ColumnHeaderProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1',
        className
      )}
    >
      <h2 className="truncate text-sm font-semibold leading-none">{title}</h2>
      {actions ? (
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      ) : null}
    </div>
  )
}

/** Strip default Card vertical chrome for full-height column panels */
export const columnCardClassName = 'h-full flex flex-col flex-1 overflow-hidden gap-0 py-0'

/** Shared scrollable body — flush under header */
export const columnBodyClassName = 'flex-1 overflow-y-auto min-h-0 px-2 pb-1 pt-0'

/** Shared footer strip (chat input, context bar) */
export const columnFooterClassName = 'flex-shrink-0 border-t px-2 py-1'

/** Shared classes for primary header CTAs (Add Source, Write Note, etc.) */
export const columnHeaderPrimaryButtonClassName = 'h-6 gap-1 px-2 text-xs'

/** Shared classes for secondary text+icon header buttons (Sessions, etc.) */
export const columnHeaderGhostButtonClassName = 'h-6 gap-1 px-2 text-xs'

/** Shared classes for secondary/ghost header icon buttons */
export const columnHeaderIconButtonClassName = 'h-6 w-6 p-0'

/** Shared icon size inside column headers */
export const columnHeaderIconClassName = 'h-3.5 w-3.5'
