'use client'

import { useState } from 'react'
import { ProjectResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUpdateProject } from '@/lib/hooks/use-projects'
import { ProjectDeleteDialog } from './ProjectDeleteDialog'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { listActionTriggerClassName } from '@/lib/utils/list-action-trigger'

interface ProjectActionsMenuProps {
  project: ProjectResponse
}

export function ProjectActionsMenu({ project }: ProjectActionsMenuProps) {
  const { t } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const updateProject = useUpdateProject()

  const handleArchiveToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateProject.mutate({
      id: project.id,
      data: { archived: !project.archived },
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-6 w-6 shrink-0 p-0', listActionTriggerClassName)}
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
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation()
              setShowDeleteDialog(true)
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        projectId={project.id}
        projectName={project.name}
      />
    </>
  )
}
