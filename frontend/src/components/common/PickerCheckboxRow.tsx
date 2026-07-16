'use client'

import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export interface PickerCheckboxRowProps {
  id: string
  title: ReactNode
  description?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  /** Optional content next to the title (e.g. badges). */
  meta?: ReactNode
  /** Optional content below the description (e.g. unavailable notes). */
  footer?: ReactNode
  /** Leading content before the title (e.g. type icons). */
  leading?: ReactNode
  className?: string
  /** When true, use bordered card-style row instead of divide-y list row. */
  bordered?: boolean
}

/**
 * Shared multi-select checkbox row for picker dialogs.
 * Prefer this over hand-rolled checkbox+label markup in Skill/Tool/source pickers.
 */
export function PickerCheckboxRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  meta,
  footer,
  leading,
  className,
  bordered = false,
}: PickerCheckboxRowProps) {
  const checkboxId = `picker-row-${id}`

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        'flex items-start gap-2',
        bordered
          ? 'rounded-md border px-2 py-1.5'
          : 'cursor-pointer px-1 py-1.5 hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-60',
        !disabled && bordered && 'cursor-pointer',
        className
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={checked}
        disabled={disabled}
        className="mt-0.5"
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          {leading}
          <span className="block truncate text-sm font-medium leading-snug">{title}</span>
          {meta}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground line-clamp-2">
            {description}
          </span>
        ) : null}
        {footer}
      </span>
    </label>
  )
}
