'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ProjectResponse } from '@/lib/types/api'
import { Badge } from '@/components/ui/badge'
import { FileText, StickyNote, BookOpen } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'
import { ProjectActionsMenu } from './ProjectActionsMenu'

interface ProjectRowProps {
  project: ProjectResponse
}

export function ProjectRow({ project }: ProjectRowProps) {
  const { t, language } = useTranslation()
  const router = useRouter()

  const handleRowClick = () => {
    router.push(`/projects/${encodeURIComponent(project.id)}`)
  }

  const updatedLabel = t('common.updated').replace(
    '{time}',
    formatDistanceToNow(new Date(project.updated), {
      addSuffix: true,
      locale: getDateLocale(language),
    }),
  )

  return (
    <div
      className="group flex cursor-pointer items-start gap-2 px-3 py-1.5 transition-colors hover:bg-muted/40"
      onClick={handleRowClick}
    >
      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href={`/projects/${encodeURIComponent(project.id)}`}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate rounded-sm text-sm font-medium outline-none transition-colors group-hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {project.name}
          </Link>
          {project.archived ? (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
              {t('projects.archived')}
            </Badge>
          ) : null}
          <ProjectActionsMenu project={project} />
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {project.description ? (
            <>
              <span>{project.description}</span>
              <span aria-hidden> · </span>
            </>
          ) : null}
          <span>{updatedLabel}</span>
          <span aria-hidden> · </span>
          <span className="inline-flex items-center gap-0.5">
            <FileText className="h-3 w-3" aria-hidden />
            {project.source_count}
          </span>
          <span aria-hidden> · </span>
          <span className="inline-flex items-center gap-0.5">
            <StickyNote className="h-3 w-3" aria-hidden />
            {project.note_count}
          </span>
        </p>
      </div>
    </div>
  )
}
