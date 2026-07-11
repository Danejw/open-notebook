'use client'

import { useMemo, useState, useDeferredValue, useEffect } from 'react'

import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { NotebookList } from './components/NotebookList'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw, LayoutGrid, List } from 'lucide-react'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { CreateNotebookDialog } from '@/components/notebooks/CreateNotebookDialog'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useNotebookViewStore } from '@/lib/stores/notebook-view-store'
import { cn } from '@/lib/utils'

export default function NotebooksPage() {
  const { t } = useTranslation()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [archivedEnabled, setArchivedEnabled] = useState(false)
  const viewMode = useNotebookViewStore((state) => state.viewMode)
  const setViewMode = useNotebookViewStore((state) => state.setViewMode)
  const { data: notebooks, isLoading, refetch } = useNotebooks(false)
  const { data: archivedNotebooks } = useNotebooks(true, { enabled: archivedEnabled })

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
    if (!notebooks) {
      return undefined
    }
    if (!normalizedQuery) {
      return notebooks
    }
    return notebooks.filter((notebook) =>
      notebook.name.toLowerCase().includes(normalizedQuery)
    )
  }, [notebooks, normalizedQuery])

  const filteredArchived = useMemo(() => {
    if (!archivedNotebooks) {
      return undefined
    }
    if (!normalizedQuery) {
      return archivedNotebooks
    }
    return archivedNotebooks.filter((notebook) =>
      notebook.name.toLowerCase().includes(normalizedQuery)
    )
  }, [archivedNotebooks, normalizedQuery])

  const hasArchived = (archivedNotebooks?.length ?? 0) > 0
  const isSearching = normalizedQuery.length > 0

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className={cn(pageContentClassName, 'space-y-6')}>
        <PageHeader
          bordered
          title={t('notebooks.title')}
          actions={
            <>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => refetch()} aria-label={t('common.refresh')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <div className="flex items-center rounded-md border p-0.5">
                <Button
                  variant={viewMode === 'tile' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('tile')}
                  aria-label={t('notebooks.tileView')}
                  aria-pressed={viewMode === 'tile'}
                  title={t('notebooks.tileView')}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('list')}
                  aria-label={t('notebooks.listView')}
                  aria-pressed={viewMode === 'list'}
                  title={t('notebooks.listView')}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                id="notebook-search"
                name="notebook-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('notebooks.searchPlaceholder')}
                autoComplete="off"
                aria-label={t('common.accessibility.searchNotebooks') || 'Search notebooks'}
                className="h-7 w-full sm:w-48 text-xs"
              />
              <Button size="sm" className="h-7 text-xs" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t('notebooks.newNotebook')}
              </Button>
            </>
          }
        />
        
        <div className="space-y-4">
          <NotebookList 
            notebooks={filteredActive} 
            isLoading={isLoading}
            title={t('notebooks.activeNotebooks')}
            emptyTitle={isSearching ? t('common.noMatches') : undefined}
            emptyDescription={isSearching ? t('common.tryDifferentSearch') : undefined}
            onAction={!isSearching ? () => setCreateDialogOpen(true) : undefined}
            actionLabel={!isSearching ? t('notebooks.newNotebook') : undefined}
          />
          
          {hasArchived && (
            <NotebookList 
              notebooks={filteredArchived} 
              isLoading={false}
              title={t('notebooks.archivedNotebooks')}
              collapsible
              emptyTitle={isSearching ? t('common.noMatches') : undefined}
              emptyDescription={isSearching ? t('common.tryDifferentSearch') : undefined}
            />
          )}
        </div>
        </div>
      </div>

      <CreateNotebookDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  )
}
