'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export type { MarkdownRendererProps } from '@/components/common/MarkdownRendererCore'

function MarkdownLoadingSkeleton() {
  return (
    <div className="markdown-body space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  )
}

export const MarkdownRenderer = dynamic(
  () =>
    import('@/components/common/MarkdownRendererCore').then((mod) => ({
      default: mod.MarkdownRendererCore,
    })),
  {
    ssr: false,
    loading: () => <MarkdownLoadingSkeleton />,
  }
)
