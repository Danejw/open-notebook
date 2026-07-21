'use client'

import { EmptyState } from '@/components/common/EmptyState'
import { PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
import { PickerSelectRow } from '@/components/common/PickerSelectRow'
import { cn } from '@/lib/utils'

export interface InlinePickerListItem {
  id: string
  title: string
  description?: string
}

export interface InlinePickerListProps {
  items: InlinePickerListItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
  loading?: boolean
  emptyTitle: string
  className?: string
  skeletonRows?: number
}

export function InlinePickerList({
  items,
  selectedIds,
  onToggle,
  loading = false,
  emptyTitle,
  className,
  skeletonRows = 3,
}: InlinePickerListProps) {
  if (loading) {
    return (
      <div className={cn('rounded-md border border-border bg-card', className)}>
        <div className="max-h-48 overflow-y-auto p-0.5">
          <PickerDialogSkeleton rows={skeletonRows} />
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={cn('rounded-md border border-border bg-card p-2', className)}>
        <EmptyState variant="subtle" title={emptyTitle} titleClassName="text-xs" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-md border border-border bg-card', className)}>
      <div className="max-h-48 overflow-y-auto">
        <div className="divide-y divide-border">
          {items.map((item) => (
            <PickerSelectRow
              key={item.id}
              id={item.id}
              selectionMode="multi"
              title={item.title}
              description={item.description}
              checked={selectedIds.includes(item.id)}
              onCheckedChange={() => onToggle(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
