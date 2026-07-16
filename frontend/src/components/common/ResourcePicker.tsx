'use client'

import { useMemo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
import {
  PickerDialogActions,
  PickerDialogShell,
  usePickerDialogDraft,
} from '@/components/common/PickerDialogShell'
import {
  PickerSelectRow,
  type PickerSelectRowProps,
  type PickerSelectionMode,
} from '@/components/common/PickerSelectRow'
import { cn } from '@/lib/utils'

export type ResourcePickerItemProps = Omit<
  PickerSelectRowProps,
  'id' | 'checked' | 'onCheckedChange' | 'selectionMode'
>

type ResourcePickerSharedProps<T> = {
  title: ReactNode
  trigger: ReactNode
  items: T[]
  getItemId: (item: T) => string
  getItemProps: (item: T) => ResourcePickerItemProps
  isLoading?: boolean
  emptyTitle: string
  cancelLabel: string
  saveLabel: string
  /** Shown in footer for single-select when a value is drafted. */
  clearLabel?: string
  /** When false, hide the single-select Clear control. Defaults to true when clearLabel is set. */
  showClear?: boolean
  /** Value written on Clear for single-select (defaults to null). */
  clearValue?: string | null
  /** Multi-select footer count label. */
  formatSelectedCount?: (count: number) => string
  beforeBody?: ReactNode
  afterBody?:
    | ReactNode
    | ((ctx: { draftIds: string[]; draftSingle: string | null }) => ReactNode)
  groupBy?: (item: T) => { key: string; label: string }
  listClassName?: string
  bodyClassName?: string
  skeletonRows?: number
  emptyClassName?: string
  contentClassName?: string
  /** Fired when the dialog opens or closes (for lazy catalog fetches). */
  onOpenChange?: (open: boolean) => void
}

type ResourcePickerMultiProps<T> = ResourcePickerSharedProps<T> & {
  selectionMode: 'multi'
  value: string[]
  onChange: (ids: string[]) => void
}

type ResourcePickerSingleProps<T> = ResourcePickerSharedProps<T> & {
  selectionMode: 'single'
  value: string | null
  onChange: (id: string | null) => void
}

export type ResourcePickerProps<T> =
  | ResourcePickerMultiProps<T>
  | ResourcePickerSingleProps<T>

function isMultiProps<T>(
  props: ResourcePickerProps<T>
): props is ResourcePickerMultiProps<T> {
  return props.selectionMode === 'multi'
}

/**
 * Shared draft → Save/Cancel resource picker for chat and settings selection.
 */
export function ResourcePicker<T>(props: ResourcePickerProps<T>) {
  const {
    title,
    trigger,
    items,
    getItemId,
    getItemProps,
    isLoading = false,
    emptyTitle,
    cancelLabel,
    saveLabel,
    clearLabel,
    showClear,
    clearValue = null,
    formatSelectedCount,
    beforeBody,
    afterBody,
    groupBy,
    listClassName,
    bodyClassName,
    skeletonRows = 4,
    emptyClassName,
    contentClassName,
    onOpenChange,
    selectionMode,
  } = props

  const draftSeed: string[] | string | null = isMultiProps(props)
    ? props.value
    : props.value
  const { open, draft, setDraft, handleOpenChange, close } =
    usePickerDialogDraft<string[] | string | null>(draftSeed)

  const handleDialogOpenChange = (nextOpen: boolean) => {
    handleOpenChange(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const draftIds: string[] = useMemo(() => {
    if (selectionMode === 'multi') {
      return Array.isArray(draft) ? draft : []
    }
    return typeof draft === 'string' && draft.length > 0 ? [draft] : []
  }, [draft, selectionMode])

  const draftSingle: string | null =
    selectionMode === 'single' && typeof draft === 'string' ? draft : null

  const grouped = useMemo(() => {
    if (!groupBy) return null
    const groups = new Map<string, { label: string; items: T[] }>()
    for (const item of items) {
      const { key, label } = groupBy(item)
      const existing = groups.get(key)
      if (existing) {
        existing.items.push(item)
      } else {
        groups.set(key, { label, items: [item] })
      }
    }
    return Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        label: group.label,
        items: group.items,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [groupBy, items])

  const toggleItem = (id: string, checked: boolean) => {
    if (selectionMode === 'multi') {
      const current = Array.isArray(draft) ? draft : []
      if (checked) {
        setDraft(current.includes(id) ? current : [...current, id])
      } else {
        setDraft(current.filter((itemId) => itemId !== id))
      }
      return
    }

    setDraft(checked ? id : null)
  }

  const handleSave = () => {
    if (isMultiProps(props)) {
      props.onChange(Array.isArray(draft) ? draft : [])
    } else {
      props.onChange(typeof draft === 'string' ? draft : null)
    }
    close()
  }

  const handleClear = () => {
    if (selectionMode === 'multi') {
      setDraft([])
    } else {
      setDraft(clearValue)
    }
  }

  const clearEnabled = showClear ?? Boolean(clearLabel)

  const footerLeft =
    selectionMode === 'single' && clearEnabled ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={handleClear}
        disabled={
          clearValue == null ? !draftSingle : draftSingle === clearValue || draftSingle == null
        }
      >
        {clearLabel ?? 'Clear'}
      </Button>
    ) : selectionMode === 'multi' ? (
      <span className="text-[11px] text-muted-foreground">
        {draftIds.length > 0 && formatSelectedCount
          ? formatSelectedCount(draftIds.length)
          : '\u00a0'}
      </span>
    ) : (
      <span className="text-[11px] text-muted-foreground">{'\u00a0'}</span>
    )

  const resolvedAfterBody =
    typeof afterBody === 'function'
      ? afterBody({ draftIds, draftSingle })
      : afterBody

  const renderRow = (item: T) => {
    const id = getItemId(item)
    const itemProps = getItemProps(item)
    return (
      <PickerSelectRow
        key={id}
        id={id}
        selectionMode={selectionMode as PickerSelectionMode}
        checked={draftIds.includes(id)}
        onCheckedChange={(checked) => toggleItem(id, checked)}
        {...itemProps}
      />
    )
  }

  return (
    <PickerDialogShell
      open={open}
      onOpenChange={handleDialogOpenChange}
      title={title}
      trigger={trigger}
      beforeBody={beforeBody}
      afterBody={resolvedAfterBody}
      contentClassName={contentClassName}
      bodyClassName={bodyClassName}
      footerLeft={footerLeft}
      actions={
        <PickerDialogActions
          cancelLabel={cancelLabel}
          saveLabel={saveLabel}
          onCancel={close}
          onSave={handleSave}
        />
      }
    >
      {isLoading ? (
        <PickerDialogSkeleton rows={skeletonRows} />
      ) : items.length === 0 ? (
        <EmptyState
          variant="subtle"
          title={emptyTitle}
          titleClassName="text-xs"
          className={emptyClassName}
        />
      ) : grouped ? (
        <div className={cn('space-y-3 px-1 py-1', listClassName)}>
          {grouped.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-1.5">{group.items.map(renderRow)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn('divide-y', listClassName)}>{items.map(renderRow)}</div>
      )}
    </PickerDialogShell>
  )
}
