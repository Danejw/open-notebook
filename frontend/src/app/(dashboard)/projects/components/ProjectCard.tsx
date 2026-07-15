'use client'

import { useRouter } from 'next/navigation'
import { ProjectResponse } from '@/lib/types/api'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { ProjectActionsMenu } from './ProjectActionsMenu'

interface ProjectCardProps {
  project: ProjectResponse
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { t } = useTranslation()
  const router = useRouter()

  const handleCardClick = () => {
    router.push(`/projects/${encodeURIComponent(project.id)}`)
  }

  return (
    <div
      className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/40"
      onClick={handleCardClick}
    >
      <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
            {project.name}
          </span>
          {project.archived ? (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
              {t('projects.archived')}
            </Badge>
          ) : null}
          <ProjectActionsMenu project={project} />
        </div>
      </div>
    </div>
  )
}
