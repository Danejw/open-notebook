'use client'

import { useMemo, useState, useDeferredValue, useEffect } from 'react'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { ProjectList } from './components/ProjectList'
import { Button } from '@/components/ui/button'
import { Plus, LayoutGrid, List } from 'lucide-react'
import { useProjects } from '@/lib/hooks/use-projects'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useProjectViewStore } from '@/lib/stores/project-view-store'
import { cn } from '@/lib/utils'

export default function ProjectsPage() {
  const { t } = useTranslation()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [archivedEnabled, setArchivedEnabled] = useState(false)
  const viewMode = useProjectViewStore((state) => state.viewMode)
  const setViewMode = useProjectViewStore((state) => state.setViewMode)
  const { data: projects, isLoading, refetch } = useProjects(false)
  const { data: archivedProjects } = useProjects(true, { enabled: archivedEnabled })

  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setArchivedEnabled(true))
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(() => setArchivedEnabled(true), 1000)
    return () => clearTimeout(timer)
  }, [])

  const normalizedQuery = deferredSearchTerm.trim().toLowerCase()

  const filteredActive = useMemo(() => {
    if (!projects) {
      return undefined
    }
    if (!normalizedQuery) {
      return projects
    }
    return projects.filter((project) =>
      project.name.toLowerCase().includes(normalizedQuery)
    )
  }, [projects, normalizedQuery])

  const filteredArchived = useMemo(() => {
    if (!archivedProjects) {
      return undefined
    }
    if (!normalizedQuery) {
      return archivedProjects
    }
    return archivedProjects.filter((project) =>
      project.name.toLowerCase().includes(normalizedQuery)
    )
  }, [archivedProjects, normalizedQuery])

  const hasArchived = (archivedProjects?.length ?? 0) > 0
  const isSearching = normalizedQuery.length > 0

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('projects.title')}
          actions={
            <div className="flex items-center gap-1">
              <PageRefreshButton onClick={() => refetch()} />
              <div className="flex items-center rounded-md border p-0.5">
                <Button
                  variant={viewMode === 'tile' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('tile')}
                  aria-label={t('projects.tileView')}
                  aria-pressed={viewMode === 'tile'}
                  title={t('projects.tileView')}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('list')}
                  aria-label={t('projects.listView')}
                  aria-pressed={viewMode === 'list'}
                  title={t('projects.listView')}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                id="project-search"
                name="project-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('projects.searchPlaceholder')}
                autoComplete="off"
                aria-label={t('common.accessibility.searchProjects') || 'Search projects'}
                className="h-7 w-full sm:w-48 text-xs"
              />
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t('projects.newProject')}
              </Button>
            </div>
          }
        />
        
        <div className="space-y-3">
          <ProjectList 
            projects={filteredActive} 
            isLoading={isLoading}
            title={t('projects.activeProjects')}
            emptyTitle={isSearching ? t('common.noMatches') : undefined}
            emptyDescription={isSearching ? t('common.tryDifferentSearch') : undefined}
            onAction={!isSearching ? () => setCreateDialogOpen(true) : undefined}
            actionLabel={!isSearching ? t('projects.newProject') : undefined}
          />
          
          {hasArchived && (
            <ProjectList 
              projects={filteredArchived} 
              isLoading={false}
              title={t('projects.archivedProjects')}
              collapsible
              emptyTitle={isSearching ? t('common.noMatches') : undefined}
              emptyDescription={isSearching ? t('common.tryDifferentSearch') : undefined}
            />
          )}
        </div>
        </div>
      </div>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  )
}
