import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DashboardContentSkeleton } from '@/components/layout/DashboardContentSkeleton'

interface AppShellSkeletonProps {
  className?: string
  /** When true, show three-column project layout skeleton */
  projectDetail?: boolean
}

/** Full-viewport shell skeleton — used before dashboard layout mounts (e.g. ConnectionGuard). */
export function AppShellSkeleton({ className, projectDetail = false }: AppShellSkeletonProps) {
  return (
    <div className={cn('flex h-dvh max-h-dvh gap-0.5 overflow-hidden overscroll-none bg-background p-0.5', className)}>
      <div className="flex w-52 shrink-0 flex-col self-stretch overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-sidebar-border px-2">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex-1 space-y-2 p-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="space-y-2 border-t border-sidebar-border p-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <DashboardContentSkeleton projectDetail={projectDetail} />
      </div>
    </div>
  )
}
