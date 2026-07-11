import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/** Small inline placeholder for buttons and icons during async actions */
export function InlineSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('inline-block h-4 w-4 shrink-0 rounded-sm', className)} />
}

export function ListRowsSkeleton({
  rows = 4,
  withHeader = true,
}: {
  rows?: number
  withHeader?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      {withHeader && (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-24" />
        </div>
      )}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <CompactListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function CompactListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
    </div>
  )
}

export function SettingsFormSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-lg border p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-9 w-full max-w-xs" />
        </div>
      ))}
    </div>
  )
}

export function ColumnCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-sm" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function PickerDialogSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SourceDetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-3 space-y-2">
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-3 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4 min-h-0">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="min-h-[120px] flex-1 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <Skeleton className="h-7 w-28" />
      <div className="space-y-2 border-b pb-4">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="min-h-[320px] rounded-lg" />
      </div>
    </div>
  )
}

export function LoginCardSkeleton() {
  return (
    <div className="w-full max-w-md space-y-4 rounded-lg border p-6">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-6 w-40" />
        <Skeleton className="mx-auto h-4 w-56" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export function TableLoadMoreSkeleton() {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

export function OverlayPanelSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Skeleton className="h-8 w-8 rounded-md" />
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

export function ProcessingDialogSkeleton() {
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-5 shrink-0 rounded-sm" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function AgentActivitySkeleton() {
  return (
    <div className="flex items-start gap-2 rounded-md border px-3 py-2">
      <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-full max-w-sm" />
      </div>
    </div>
  )
}

export function SelectMenuSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = ['w-full', 'w-4/5', 'w-3/5'] as const
  return (
    <div className="space-y-2 px-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', widths[i % widths.length])} />
      ))}
    </div>
  )
}

export function SearchButtonSkeleton() {
  return <Skeleton className="h-9 w-24 shrink-0" />
}

export function PanelSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-64 rounded-lg', className)} />
}
