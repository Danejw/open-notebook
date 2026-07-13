'use client'

import { useState, type ReactNode } from 'react'
import { ProjectResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useUpdateProject } from '@/lib/hooks/use-projects'
import { ProjectDeleteDialog } from './ProjectDeleteDialog'
import { InlineEdit } from '@/components/common/InlineEdit'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ProjectHeaderProps {
  project: ProjectResponse
  /** Optional extra actions rendered before Archive/Delete. */
  actions?: ReactNode
}

export function ProjectHeader({ project, actions }: ProjectHeaderProps) {
  const { t } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const updateProject = useUpdateProject()
  const hasDescription = Boolean(project.description?.trim())

  const handleUpdateName = async (name: string) => {
    if (!name || name === project.name) return

    await updateProject.mutateAsync({
      id: project.id,
      data: { name },
    })
  }

  const handleUpdateDescription = async (description: string) => {
    if (description === project.description) return

    await updateProject.mutateAsync({
      id: project.id,
      data: { description: description || undefined },
    })
  }

  const handleArchiveToggle = () => {
    updateProject.mutate({
      id: project.id,
      data: { archived: !project.archived },
    })
  }

  return (
    <>
      <div className="py-1">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <InlineEdit
                id="project-name"
                name="project-name"
                value={project.name}
                onSave={handleUpdateName}
                className="min-w-0 flex-1 truncate break-normal text-base font-semibold leading-snug"
                inputClassName="text-base font-semibold"
                placeholder={t('projects.namePlaceholder')}
              />
              {project.archived ? (
                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                  {t('projects.archived')}
                </Badge>
              ) : null}
            </div>

            {hasDescription ? (
              <InlineEdit
                id="project-description"
                name="project-description"
                value={project.description ?? ''}
                onSave={handleUpdateDescription}
                className="text-xs text-muted-foreground break-words"
                inputClassName="text-xs text-muted-foreground"
                placeholder={t('projects.addDescription')}
                multiline
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1 shrink-0">
            {actions}
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleArchiveToggle}>
              {project.archived ? (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('projects.unarchive')}</span>
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('projects.archive')}</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{t('common.delete')}</span>
            </Button>
          </div>
        </div>
      </div>

      <ProjectDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        projectId={project.id}
        projectName={project.name}
        redirectAfterDelete
      />
    </>
  )
}
