import { Skeleton } from '@/components/ui/skeleton'

export function SourcesTableSkeleton() {
  return (
    <div className="flex-1 overflow-auto rounded-md border">
      <div className="border-b bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="hidden h-3 w-20 sm:block" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3 py-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-3 w-20 sm:block" />
          <Skeleton className="h-7 w-7" />
        </div>
      ))}
    </div>
  )
}
