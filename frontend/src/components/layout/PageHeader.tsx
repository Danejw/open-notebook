'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  icon?: LucideIcon
  actions?: React.ReactNode
  leading?: React.ReactNode
  className?: string
  bordered?: boolean
}

export function PageHeader({
  title,
  description,
  meta,
  icon: Icon,
  actions,
  leading,
  className,
  bordered = false,
}: PageHeaderProps) {
  const hasDescription = Boolean(description)
  const hasMeta = Boolean(meta)

  return (
    <header
      className={cn(
        'flex-shrink-0 py-2',
        bordered && 'border-b border-border',
        className,
      )}
    >
      {leading}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {Icon ? (
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            <h1 className="truncate text-base font-semibold leading-snug">{title}</h1>
            {hasMeta ? (
              <span className="hidden text-[11px] text-muted-foreground sm:inline truncate">
                {meta}
              </span>
            ) : null}
          </div>
          {hasDescription || hasMeta ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0 text-xs text-muted-foreground">
              {hasDescription ? <span className="line-clamp-2 sm:line-clamp-1">{description}</span> : null}
              {hasDescription && hasMeta ? (
                <span className="hidden sm:inline" aria-hidden>
                  ·
                </span>
              ) : null}
              {hasMeta ? <span className="sm:hidden truncate">{meta}</span> : null}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}

/** Shared outer padding for dashboard page content below AppShell */
export const pageContentClassName = 'p-6'

/** Shared vertical gap between a page header and the content below it */
export const pageSectionGapClassName = 'space-y-6'
