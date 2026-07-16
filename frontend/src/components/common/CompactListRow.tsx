'use client'

import Link from 'next/link'
import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { listActionTriggerClassName } from '@/lib/utils/list-action-trigger'

type CompactListRowAlign = 'center' | 'start'

interface CompactListRowContextValue {
  rowHref?: string
}

const CompactListRowContext = createContext<CompactListRowContextValue>({})

function useCompactListRowContext() {
  return useContext(CompactListRowContext)
}

interface CompactListRowProps extends ComponentPropsWithoutRef<'div'> {
  href?: string
  as?: ElementType
  align?: CompactListRowAlign
  hover?: boolean
  children: ReactNode
}

export function CompactListRow({
  href,
  as: Tag = 'div',
  align = 'center',
  hover = true,
  className,
  children,
  ...props
}: CompactListRowProps) {
  const rowClassName = cn(
    'group flex gap-2 px-3 py-1.5 transition-colors',
    hover && 'hover:bg-muted/40',
    align === 'start' ? 'items-start' : 'items-center',
    className,
  )

  const content = (
    <CompactListRowContext.Provider value={{ rowHref: href }}>
      {children}
    </CompactListRowContext.Provider>
  )

  if (href) {
    return (
      <Link href={href} className={rowClassName} {...props}>
        {content}
      </Link>
    )
  }

  return (
    <Tag className={rowClassName} {...props}>
      {content}
    </Tag>
  )
}

interface CompactListRowIconProps {
  children: ReactNode
  className?: string
}

export function CompactListRowIcon({ children, className }: CompactListRowIconProps) {
  return (
    <div
      className={cn(
        'shrink-0 text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface CompactListRowContentProps {
  children: ReactNode
  className?: string
}

export function CompactListRowContent({ children, className }: CompactListRowContentProps) {
  return <div className={cn('min-w-0 flex-1', className)}>{children}</div>
}

interface CompactListRowTitleRowProps {
  children: ReactNode
  className?: string
}

export function CompactListRowTitleRow({ children, className }: CompactListRowTitleRowProps) {
  return <div className={cn('flex min-w-0 items-center gap-1', className)}>{children}</div>
}

interface CompactListRowTitleProps {
  children: ReactNode
  href?: string
  className?: string
}

export function CompactListRowTitle({ children, href, className }: CompactListRowTitleProps) {
  const { rowHref } = useCompactListRowContext()
  const titleClassName = cn(
    'min-w-0 flex-1 truncate text-sm font-medium outline-none transition-colors',
    (href || rowHref) && 'group-hover:text-primary',
    href &&
      'rounded-sm focus-visible:ring-2 focus-visible:ring-ring hover:underline',
    className,
  )

  if (href && !rowHref) {
    return (
      <Link href={href} className={titleClassName}>
        {children}
      </Link>
    )
  }

  return <span className={titleClassName}>{children}</span>
}

interface CompactListRowMetaProps {
  children: ReactNode
  className?: string
}

export function CompactListRowMeta({ children, className }: CompactListRowMetaProps) {
  return (
    <p className={cn('truncate text-[11px] text-muted-foreground', className)}>{children}</p>
  )
}

interface CompactListRowActionsProps {
  children: ReactNode
  className?: string
}

export function CompactListRowActions({ children, className }: CompactListRowActionsProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        listActionTriggerClassName,
        className,
      )}
    >
      {children}
    </div>
  )
}
