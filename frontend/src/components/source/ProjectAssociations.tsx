'use client'

import { useState, useEffect, useMemo } from 'react'
import { BookOpen } from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { InlinePickerList } from '@/components/common/InlinePickerList'
import { useProjects } from '@/lib/hooks/use-projects'
import { useAddSourcesToProject, useRemoveSourceFromProject } from '@/lib/hooks/use-sources'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ProjectAssociationsProps {
  sourceId: string
  currentProjectIds: string[]
  onSave?: () => void
}

export function ProjectAssociations({
  sourceId,
  currentProjectIds,
  onSave,
}: ProjectAssociationsProps) {
  const { t } = useTranslation()
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(currentProjectIds)
  const [isSaving, setIsSaving] = useState(false)

  const { data: projects, isLoading } = useProjects()
  const addSources = useAddSourcesToProject()
  const removeFromProject = useRemoveSourceFromProject()

  useEffect(() => {
    setSelectedProjectIds(currentProjectIds)
  }, [currentProjectIds])

  const hasChanges = useMemo(() => {
    const current = new Set(currentProjectIds)
    const selected = new Set(selectedProjectIds)

    if (current.size !== selected.size) return true

    for (const id of current) {
      if (!selected.has(id)) return true
    }

    return false
  }, [currentProjectIds, selectedProjectIds])

  const handleToggleProject = (projectId: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const handleSave = async () => {
    if (!hasChanges) return

    try {
      setIsSaving(true)

      const current = new Set(currentProjectIds)

      const toAdd = selectedProjectIds.filter(id => !current.has(id))
      const toRemove = currentProjectIds.filter(id => !selectedProjectIds.includes(id))

      if (toAdd.length > 0) {
        await Promise.allSettled(
          toAdd.map(projectId =>
            addSources.mutateAsync({
              projectId,
              sourceIds: [sourceId],
            })
          )
        )
      }

      if (toRemove.length > 0) {
        await Promise.allSettled(
          toRemove.map(projectId =>
            removeFromProject.mutateAsync({
              projectId,
              sourceId,
            })
          )
        )
      }

      onSave?.()
    } catch (error) {
      console.error('Error saving project associations:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setSelectedProjectIds(currentProjectIds)
  }

  const activeProjects = (projects ?? []).filter(project => !project.archived)
  const projectItems = activeProjects.map((project) => ({
    id: project.id,
    title: project.name,
    description: project.description || undefined,
  }))

  return (
    <div className="space-y-1 rounded-md border border-border/60 p-1">
      <div className="flex items-center gap-1 px-0.5">
        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium">{t('sources.manageProjects')}</span>
      </div>

      <InlinePickerList
        items={projectItems}
        selectedIds={selectedProjectIds}
        onToggle={handleToggleProject}
        loading={isLoading}
        emptyTitle={t('sources.noProjectsAvailable')}
      />

      {!isLoading && activeProjects.length > 0 && hasChanges && (
        <div className="flex items-center justify-end gap-1 border-t border-border pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            className="h-7"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <InlineSkeleton className="mr-1.5" />
                {t('common.saving')}...
              </>
            ) : (
              t('common.saveChanges')
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
