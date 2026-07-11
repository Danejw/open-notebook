'use client'

import { useRouter } from 'next/navigation'
import { ProjectResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Trash2,
  FileText,
  StickyNote,
  BookOpen,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUpdateProject } from '@/lib/hooks/use-projects'
import { ProjectDeleteDialog } from './ProjectDeleteDialog'
import { useState } from 'react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'

interface ProjectCardProps {
  project: ProjectResponse
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { t, language } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const router = useRouter()
  const updateProject = useUpdateProject()

  const handleArchiveToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateProject.mutate({
      id: project.id,
      data: { archived: !project.archived },
    })
  }

  const handleCardClick = () => {
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
    <>
      <div
        className="group flex cursor-pointer items-start gap-2 px-3 py-2 transition-colors hover:bg-muted/40"
        onClick={handleCardClick}
      >
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t('common.actions')}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={handleArchiveToggle}>
                  {project.archived ? (
                    <>
                      <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                      {t('projects.unarchive')}
                    </>
                  ) : (
                    <>
                      <Archive className="mr-2 h-3.5 w-3.5" />
                      {t('projects.archive')}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteDialog(true)
                  }}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      <ProjectDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        projectId={project.id}
        projectName={project.name}
      />
    </>
  )
}
