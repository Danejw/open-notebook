import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface DashboardContentSkeletonProps {
  className?: string
  /** When true, show three-column notebook layout skeleton */
  notebookDetail?: boolean
}

/** Main content area skeleton — use inside AppShell when the sidebar is already visible. */
export function DashboardContentSkeleton({
  className,
  notebookDetail = false,
}: DashboardContentSkeletonProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="flex-shrink-0 px-4 pt-3">
        <Skeleton className="mb-2 h-8 w-48" />
        {notebookDetail ? (
          <Skeleton className="h-10 w-full max-w-xl" />
        ) : (
          <Skeleton className="h-4 w-72" />
        )}
      </div>

      {notebookDetail ? (
        <div className="flex flex-1 gap-1 px-1.5 py-2">
          <Skeleton className="min-h-0 flex-[28] rounded-lg" />
          <Skeleton className="min-h-0 flex-[28] rounded-lg" />
          <Skeleton className="min-h-0 flex-[44] rounded-lg" />
        </div>
      ) : (
        <div className="flex-1 space-y-4 p-4">
          <div className="flex gap-2">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-7 max-w-xs flex-1" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
