'use client'

import { useCallback, type KeyboardEvent, type MutableRefObject } from 'react'
import { useLongPress } from '@/lib/hooks/use-long-press'

export interface SelectableRowClassNameOptions {
  /** When true, only ring styling (no background fill). Used during processing. */
  ringOnly?: boolean
}

export function selectableRowClassName(
  selected: boolean,
  options: SelectableRowClassNameOptions = {},
): string | undefined {
  if (!selected) return undefined
  const { ringOnly = false } = options
  if (ringOnly) return 'ring-1 ring-primary/40'
  return 'bg-primary/10 ring-1 ring-primary/40'
}

export interface UseSelectableRowOptions {
  selectionMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onEnterSelection?: () => void
  /** Called when the row is activated outside selection mode (click / keyboard). */
  onActivate?: () => void
  /** Disables long-press when true. */
  longPressDisabled?: boolean
  /** Optional ref to suppress click after drag. */
  suppressClickRef?: MutableRefObject<boolean>
  /** When true, selected styling shows ring only (no background). */
  selectedRingOnly?: boolean
}

export function useSelectableRow({
  selectionMode,
  selected,
  onToggleSelect,
  onEnterSelection,
  onActivate,
  longPressDisabled = false,
  suppressClickRef,
  selectedRingOnly = false,
}: UseSelectableRowOptions) {
  const handleActivate = useCallback(() => {
    if (suppressClickRef?.current) return
    if (selectionMode) {
      onToggleSelect()
      return
    }
    onActivate?.()
  }, [selectionMode, onToggleSelect, onActivate, suppressClickRef])

  const longPressHandlers = useLongPress({
    disabled: longPressDisabled,
    onLongPress: () => {
      if (selectionMode) {
        onToggleSelect()
      } else {
        onEnterSelection?.()
      }
    },
    onClick: handleActivate,
  })

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleActivate()
      }
    },
    [handleActivate],
  )

  const selectedClassName = selectableRowClassName(selected, {
    ringOnly: selectedRingOnly,
  })

  const rowProps = {
    role: 'button' as const,
    tabIndex: 0 as const,
    'aria-pressed': selectionMode ? selected : undefined,
    onKeyDown: handleKeyDown,
    ...longPressHandlers,
  }

  return {
    rowProps,
    selectedClassName,
    handleActivate,
  }
}
