'use client'

import { useCallback, useMemo, type ReactNode } from 'react'
import { CheckSquare, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/common/EmptyState'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { ListSelectionBar } from '@/components/common/ListSelectionBar'
import { useListSelection } from '@/lib/hooks/useListSelection'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export interface ResourceListRenderContext {
  selectionMode: boolean
  selected: boolean
  onToggle: (checked: boolean) => void
}

export interface ResourceListBulkContext {
  selectedIds: string[]
  clearSelection: () => void
  exitSelection: () => void
}

export interface ResourceListProps<T> {
  title: ReactNode
  headerActions?: ReactNode
  items: T[]
  getItemId: (item: T) => string
  renderItem: (item: T, ctx: ResourceListRenderContext) => ReactNode
  isLoading?: boolean
  empty?: ReactNode
  /** Shown when items exist but selection is empty of matches — unused; prefer empty slot. */
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  formatSelectedCount?: (count: number) => string
  bulkActions?: (ctx: ResourceListBulkContext) => ReactNode
  className?: string
  /** When false, hide the Select mode control (default true). */
  enableSelection?: boolean
}

/**
 * Manage-page list shell with optional bulk multi-select via ListSelectionBar.
 */
export function ResourceList<T>({
  title,
  headerActions,
  items,
  getItemId,
  renderItem,
  isLoading = false,
  empty,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  formatSelectedCount,
  bulkActions,
  className,
  enableSelection = true,
}: ResourceListProps<T>) {
  const { t } = useTranslation()
  const {
    selectedIds,
    selectionMode,
    clearSelection,
    enterSelection,
    exitSelection,
    selectAllVisible,
    isSelected,
    toggleSelect,
  } = useListSelection({ mode: 'explicit' })

  const allIds = useMemo(() => items.map(getItemId), [items, getItemId])

  const selectAll = useCallback(() => {
    selectAllVisible(allIds)
  }, [allIds, selectAllVisible])

  const toggleId = useCallback(
    (id: string, checked: boolean) => {
      if (checked !== isSelected(id)) {
        toggleSelect(id)
      }
    },
    [isSelected, toggleSelect]
  )

  if (isLoading) {
    return <ListRowsSkeleton rows={5} />
  }

  if (items.length === 0) {
    if (empty) return <>{empty}</>
    return (
      <EmptyState
        icon={EmptyIcon}
        title={emptyTitle ?? t('common.noResults')}
        description={emptyDescription}
      />
    )
  }

  const countLabel =
    formatSelectedCount?.(selectedIds.size) ??
    t('common.selectedItems').replace('{count}', selectedIds.size.toString())

  return (
    <div className={cn('overflow-hidden rounded-md border', className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <h2 className="text-sm font-semibold leading-none">{title}</h2>
        <div className="flex items-center gap-2">
          {enableSelection && !selectionMode ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => enterSelection()}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {t('common.selectMode')}
            </Button>
          ) : null}
          {headerActions}
        </div>
      </div>

      {selectionMode ? (
        <div className="border-b px-2 py-1.5">
          <ListSelectionBar
            count={selectedIds.size}
            countLabel={countLabel}
            onClear={exitSelection}
            onSelectAll={selectAll}
            className="mb-0 sticky top-0"
          >
            {bulkActions?.({
              selectedIds: Array.from(selectedIds),
              clearSelection,
              exitSelection,
            })}
          </ListSelectionBar>
        </div>
      ) : null}

      <div className="divide-y">
        {items.map((item) => {
          const id = getItemId(item)
          const selected = isSelected(id)
          return (
            <div key={id} className="flex items-stretch gap-0">
              {selectionMode ? (
                <div className="flex items-center pl-3">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(value) => toggleId(id, value === true)}
                    aria-label={t('common.selectAll')}
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                {renderItem(item, {
                  selectionMode,
                  selected,
                  onToggle: (checked) => toggleId(id, checked),
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
