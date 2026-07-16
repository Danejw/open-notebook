'use client'

import { ProjectResponse } from '@/lib/types/api'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  CompactListRow,
  CompactListRowContent,
  CompactListRowIcon,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from '@/components/common/CompactListRow'
import { ProjectActionsMenu } from './ProjectActionsMenu'

interface ProjectCardProps {
  project: ProjectResponse
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { t } = useTranslation()

  return (
    <CompactListRow>
      <CompactListRowIcon>
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
      </CompactListRowContent>
    </CompactListRow>
  )
}
