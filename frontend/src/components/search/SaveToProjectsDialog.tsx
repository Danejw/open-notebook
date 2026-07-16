'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogBodyClassName,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckboxList } from '@/components/ui/checkbox-list'
import { useProjects } from '@/lib/hooks/use-projects'
import { useCreateProjectArtifact } from '@/lib/hooks/use-project-artifacts'
import { InlineSkeleton, PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'

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
  answer
}: SaveToProjectsDialogProps) {
  const { t } = useTranslation()
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const { data: projects, isLoading } = useProjects(false)
  const createNote = useCreateProjectArtifact()

  const handleToggle = (projectId: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const handleSave = async () => {
    if (selectedProjectIds.length === 0) {
      toast.error(t('searchPage.selectProject'))
      return
    }

    try {
      for (const projectId of selectedProjectIds) {
        await createNote.mutateAsync({
          title: question,
          content: answer,
          artifact_kind: 'ai',
          project_id: projectId
        })
      }

      toast.success(t('searchPage.saveSuccess'))
      setSelectedProjectIds([])
      onOpenChange(false)
    } catch {
      toast.error(t('searchPage.saveError'))
    }
  }

  const projectItems = projects?.map(project => ({
    id: project.id,
    title: project.name,
    description: project.description || undefined
  })) || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('searchPage.saveToProjects')}</DialogTitle>
        </DialogHeader>

        <div className={dialogBodyClassName}>
          {isLoading ? (
            <PickerDialogSkeleton rows={4} />
          ) : (
            <CheckboxList
              items={projectItems}
              selectedIds={selectedProjectIds}
              onToggle={handleToggle}
              emptyMessage={t('sources.noProjectsFound')}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            className="h-7"
            onClick={handleSave}
            disabled={selectedProjectIds.length === 0 || createNote.isPending}
          >
            {createNote.isPending ? (
              <>
                <InlineSkeleton className="mr-2" />
                {t('searchPage.saving')}
              </>
            ) : (
              t('searchPage.saveToProject')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
