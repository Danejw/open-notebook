import { Skeleton } from '@/components/ui/skeleton'

export function SourcesTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 flex-1 max-w-md" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="hidden h-4 w-8 md:block" />
        </div>
      ))}
    </div>
  )
}
