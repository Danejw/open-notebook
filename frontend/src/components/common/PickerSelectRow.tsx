'use client'

import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export type PickerSelectionMode = 'multi' | 'single'

export interface PickerSelectRowProps {
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
  /**
   * Cardinality hint for the parent picker. Visual control stays a checkbox;
   * exclusive single-select is enforced by ResourcePicker.
   */
  selectionMode?: PickerSelectionMode
}

/**
 * Shared select row for resource pickers and manage-page bulk selection.
 * Prefer this over hand-rolled checkbox+label markup.
 */
export function PickerSelectRow({
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
  selectionMode = 'multi',
}: PickerSelectRowProps) {
  const checkboxId = `picker-row-${id}`

  return (
    <label
      htmlFor={checkboxId}
      data-selection-mode={selectionMode}
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
