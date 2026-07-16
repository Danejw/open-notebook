"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface CheckboxListItem {
  id: string
  title: string
  description?: string
}

interface CheckboxListProps {
  items: CheckboxListItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
  loading?: boolean
  emptyMessage: string
  className?: string
}

export function CheckboxList({
  items,
  selectedIds,
  onToggle,
  loading = false,
  emptyMessage,
  className
}: CheckboxListProps) {
  if (loading) {
    return (
      <div className={cn('border border-border rounded-md p-0.5 bg-card', className)}>
        <div className="animate-pulse space-y-0.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-0.5">
              <div className="w-3.5 h-3.5 bg-muted rounded" />
              <div className="flex-1">
                <div className="h-3.5 bg-muted rounded w-3/4 mb-0.5" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={cn('border border-border rounded-md p-0.5 bg-card', className)}>
        <p className="text-[11px] text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn('border border-border rounded-md bg-card', className)}>
      <div className="max-h-48 overflow-y-auto p-0.5">
        <div className="divide-y divide-border">
          {items.map((item) => (
            <label
              key={item.id}
              htmlFor={`checkbox-${item.id}`}
              className="flex items-start gap-0.5 cursor-pointer hover:bg-muted p-0.5 transition-colors"
            >
              <Checkbox
                id={`checkbox-${item.id}`}
                name={`checkbox-${item.id}`}
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => onToggle(item.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block truncate">
                  {item.title}
                </span>
                {item.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {item.description}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
