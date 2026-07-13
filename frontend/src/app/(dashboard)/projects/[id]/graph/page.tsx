'use client'

import Link from 'next/link'
import { Suspense, use } from 'react'
import { ArrowLeft } from 'lucide-react'
import { KnowledgeGraphView } from '@/components/knowledge-graph/KnowledgeGraphView'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

interface PageProps {
  params: Promise<{ id: string }>
}

function GraphPageInner({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col">
      <div className="flex items-center gap-0.5 border-b px-0.5 py-0.5">
        <Button asChild variant="ghost" size="sm" className="h-7">
          <Link href={`/projects/${encodeURIComponent(projectId)}`}>
            <ArrowLeft className="size-3.5" />
            {t('knowledge.graphBack')}
          </Link>
        </Button>
        <h1 className="truncate text-sm font-semibold">{t('knowledge.graphTitle')}</h1>
      </div>
      <div className="min-h-0 flex-1">
        <KnowledgeGraphView projectId={projectId} />
      </div>
    </div>
  )
}

export default function ProjectGraphPage({ params }: PageProps) {
  const resolved = use(params)
  const projectId = decodeURIComponent(resolved.id)
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <GraphPageInner projectId={projectId} />
    </Suspense>
  )
}
