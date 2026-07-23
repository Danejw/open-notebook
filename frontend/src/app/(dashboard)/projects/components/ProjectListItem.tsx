'use client'

import { ProjectResponse } from '@/lib/types/api'
import { Badge } from '@/components/ui/badge'
import { BookOpen, FileText, StickyNote } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'
import {
  CompactListRow,
  CompactListRowContent,
  CompactListRowIcon,
  CompactListRowMeta,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from '@/components/common/CompactListRow'
import { ProjectActionsMenu } from './ProjectActionsMenu'

export interface ProjectListItemProps {
  project: ProjectResponse
  /** When true, show description/updated/counts meta (list density). */
  showMeta?: boolean
}

export function ProjectListItem({ project, showMeta = false }: ProjectListItemProps) {
  const { t, language } = useTranslation()

  const updatedLabel = showMeta
    ? t('common.updated').replace(
        '{time}',
        formatDistanceToNow(new Date(project.updated), {
          addSuffix: true,
          locale: getDateLocale(language),
        })
      )
    : null

  return (
    <CompactListRow align={showMeta ? 'start' : 'center'}>
      <CompactListRowIcon className={showMeta ? 'mt-0.5' : undefined}>
        <BookOpen aria-hidden />
      </CompactListRowIcon>
      <CompactListRowContent>
        <CompactListRowTitleRow>
          <CompactListRowTitle href={`/projects/${encodeURIComponent(project.id)}`}>
            {project.name}
          </CompactListRowTitle>
          {project.archived ? (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
              {t('projects.archived')}
            </Badge>
          ) : null}
          <ProjectActionsMenu project={project} />
        </CompactListRowTitleRow>
        {showMeta ? (
          <CompactListRowMeta>
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
          </CompactListRowMeta>
        ) : null}
      </CompactListRowContent>
    </CompactListRow>
  )
}
