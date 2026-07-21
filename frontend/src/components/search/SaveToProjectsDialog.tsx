'use client'

import { ResourcePicker } from '@/components/common/ResourcePicker'
import { useProjects } from '@/lib/hooks/use-projects'
import { useCreateProjectArtifact } from '@/lib/hooks/use-project-artifacts'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ProjectResponse } from '@/lib/types/api'
import { toast } from 'sonner'

interface SaveToProjectsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  question: string
  answer: string
}

export function SaveToProjectsDialog({
  open,
  onOpenChange,
  question,
  answer,
}: SaveToProjectsDialogProps) {
  const { t } = useTranslation()
  const { data: projects, isLoading } = useProjects(false)
  const createNote = useCreateProjectArtifact()

  const projectItems: ProjectResponse[] = projects ?? []

  const handleSave = (selectedProjectIds: string[]) => {
    if (selectedProjectIds.length === 0) {
      toast.error(t('searchPage.selectProject'))
      return
    }

    void (async () => {
      try {
        for (const projectId of selectedProjectIds) {
          await createNote.mutateAsync({
            title: question,
            content: answer,
            artifact_kind: 'ai',
            project_id: projectId,
          })
        }

        toast.success(t('searchPage.saveSuccess'))
      } catch {
        toast.error(t('searchPage.saveError'))
      }
    })()
  }

  return (
    <ResourcePicker
      selectionMode="multi"
      open={open}
      onOpenChange={onOpenChange}
      value={[]}
      onChange={handleSave}
      title={t('searchPage.saveToProjects')}
      items={projectItems}
      getItemId={(project) => project.id}
      getItemProps={(project) => ({
        title: project.name,
        description: project.description || undefined,
      })}
      isLoading={isLoading}
      emptyTitle={t('sources.noProjectsFound')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('searchPage.saveToProject')}
    />
  )
}
