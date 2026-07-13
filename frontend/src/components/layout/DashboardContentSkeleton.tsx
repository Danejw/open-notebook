import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  projectPageInsetClassName,
} from '@/components/projects/ColumnHeader'

interface DashboardContentSkeletonProps {
  className?: string
  /** When true, show three-column project layout skeleton */
  projectDetail?: boolean
}

/** Main content area skeleton — use inside AppShell when the sidebar is already visible. */
export function DashboardContentSkeleton({
  className,
  projectDetail = false,
}: DashboardContentSkeletonProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div
        className={cn(
          'flex-shrink-0',
          projectDetail ? 'px-2 pt-2 pb-0' : 'px-4 pt-3'
        )}
      >
        <Skeleton className={cn('h-8 w-48', !projectDetail && 'mb-2')} />
        {!projectDetail ? <Skeleton className="h-4 w-72" /> : null}
      </div>

      {projectDetail ? (
        <div className={cn('flex flex-1 gap-1', projectPageInsetClassName)}>
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
