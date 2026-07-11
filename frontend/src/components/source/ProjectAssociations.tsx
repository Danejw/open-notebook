'use client'

import { useState, useEffect, useMemo } from 'react'
import { BookOpen, Check } from 'lucide-react'
import { InlineSkeleton, PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
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
      const selected = new Set(selectedProjectIds)

      const toAdd = selectedProjectIds.filter(id => !current.has(id))
      const toRemove = currentProjectIds.filter(id => !selected.has(id))

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('sources.manageProjects')}
          </CardTitle>
          <CardDescription>
            {t('sources.manageProjectsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PickerDialogSkeleton rows={4} />
        </CardContent>
      </Card>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('sources.manageProjects')}
          </CardTitle>
          <CardDescription>
            {t('sources.manageProjectsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('sources.noProjectsAvailable')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          {t('sources.manageProjects')}
        </CardTitle>
        <CardDescription>
          {t('sources.manageProjectsDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[300px] border rounded-md p-4">
          <div className="space-y-3">
            {projects
              .filter(project => !project.archived)
              .map((project) => {
                const isSelected = selectedProjectIds.includes(project.id)
                const isCurrentlyLinked = currentProjectIds.includes(project.id)

                return (
                  <div
                    key={project.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      isSelected ? 'bg-accent border-accent-foreground/20' : 'hover:bg-accent/50'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleProject(project.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm truncate">
                          {project.name}
                        </h4>
                        {isCurrentlyLinked && !hasChanges && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </ScrollArea>

        {hasChanges && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <InlineSkeleton className="mr-2" />
                  {t('common.saving')}...
                </>
              ) : (
                t('common.saveChanges')
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
