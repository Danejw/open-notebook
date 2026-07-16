'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useDebounce } from 'use-debounce'
import { Search, FileText, Link as LinkIcon, Upload } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { InlineSkeleton, PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
import { PickerSelectRow } from '@/components/common/PickerSelectRow'
import {
  PickerDialogActions,
  PickerDialogShell,
} from '@/components/common/PickerDialogShell'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { searchApi } from '@/lib/api/search'
import { sourcesApi } from '@/lib/api/sources'
import { useSources, useAddSourcesToProject } from '@/lib/hooks/use-sources'
import { SourceListResponse } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { dialogLargeContentClassName } from '@/components/ui/dialog'

interface AddExistingSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onSuccess?: () => void
}

export function AddExistingSourceDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: AddExistingSourceDialogProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [allSources, setAllSources] = useState<SourceListResponse[]>([])
  const [filteredSources, setFilteredSources] = useState<SourceListResponse[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const { data: currentProjectSources } = useSources(projectId)
  const currentSourceIds = useMemo(
    () => new Set(currentProjectSources?.map((s) => s.id) || []),
    [currentProjectSources]
  )

  const addSources = useAddSourcesToProject()

  const loadAllSources = useCallback(async () => {
    try {
      setIsSearching(true)
      const sources = await sourcesApi.list({
        limit: 100,
        offset: 0,
        sort_by: 'created',
        sort_order: 'desc',
      })

      setAllSources(sources)
      setFilteredSources(sources)
    } catch (error) {
      console.error('Error loading sources:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const performSearch = useCallback(async () => {
    if (!debouncedSearchQuery.trim()) {
      setFilteredSources(allSources)
      setIsSearching(false)
      return
    }

    try {
      setIsSearching(true)
      const response = await searchApi.search({
        query: debouncedSearchQuery,
        type: 'text',
        search_sources: true,
        search_notes: false,
        limit: 100,
        minimum_score: 0.01,
      })

      const sources = response.results.map((r) => ({
        id: r.parent_id,
        title: r.title || 'Untitled',
        topics: [],
        asset: null,
        embedded: false,
        embedded_chunks: 0,
        created: r.created,
        updated: r.updated,
      })) as SourceListResponse[]

      setFilteredSources(sources)
    } catch (error) {
      console.error('Error searching sources:', error)
      setFilteredSources(allSources)
    } finally {
      setIsSearching(false)
    }
  }, [debouncedSearchQuery, allSources])

  useEffect(() => {
    if (open) {
      loadAllSources()
    } else {
      setSelectedSourceIds([])
      setSearchQuery('')
    }
  }, [open, loadAllSources])

  useEffect(() => {
    if (!debouncedSearchQuery) {
      setFilteredSources(allSources)
      setIsSearching(false)
      return
    }

    performSearch()
  }, [debouncedSearchQuery, allSources, performSearch])

  const handleToggleSource = (sourceId: string, checked: boolean) => {
    setSelectedSourceIds((prev) => {
      if (checked) {
        return prev.includes(sourceId) ? prev : [...prev, sourceId]
      }
      return prev.filter((id) => id !== sourceId)
    })
  }

  const handleAddSelected = async () => {
    if (selectedSourceIds.length === 0) return

    try {
      await addSources.mutateAsync({
        projectId,
        sourceIds: selectedSourceIds,
      })

      setSelectedSourceIds([])
      setSearchQuery('')
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Error adding sources:', error)
    }
  }

  const getSourceIcon = (source: SourceListResponse) => {
    if (source.asset?.url) {
      return <LinkIcon className="h-4 w-4" />
    }
    if (source.asset?.file_path) {
      return <Upload className="h-4 w-4" />
    }
    return <FileText className="h-4 w-4" />
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString()
    } catch {
      return ''
    }
  }

  return (
    <PickerDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('sources.addExistingTitle')}
      contentClassName={dialogLargeContentClassName}
      bodyClassName="max-h-[400px] border rounded-md"
      beforeBody={
        <div className="space-y-3 border-b px-3 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('sources.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-9 text-xs"
            />
            {isSearching ? (
              <InlineSkeleton className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            ) : null}
          </div>
          {allSources.length >= 100 && !debouncedSearchQuery ? (
            <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              {t('sources.showingFirst100')}
            </div>
          ) : null}
        </div>
      }
      footerLeft={
        <span className="text-[11px] text-muted-foreground">
          {selectedSourceIds.length > 0
            ? t('sources.selectedCount').replace(
                '{count}',
                selectedSourceIds.length.toString()
              )
            : '\u00a0'}
        </span>
      }
      actions={
        <PickerDialogActions
          cancelLabel={t('common.cancel')}
          saveLabel={
            addSources.isPending ? t('common.adding') : t('common.addSelected')
          }
          onCancel={() => onOpenChange(false)}
          onSave={() => {
            void handleAddSelected()
          }}
          cancelDisabled={addSources.isPending}
          saveDisabled={selectedSourceIds.length === 0 || addSources.isPending}
        />
      }
    >
      {isSearching && filteredSources.length === 0 ? (
        <div className="p-2">
          <PickerDialogSkeleton rows={4} />
        </div>
      ) : filteredSources.length === 0 ? (
        <EmptyState
          variant="subtle"
          title={t('sources.noProjectsFound')}
          className="py-10"
          titleClassName="text-xs"
        />
      ) : (
        <div className="divide-y p-1">
          {filteredSources.map((source) => {
            const isAlreadyLinked = currentSourceIds.has(source.id)
            const isSelected = selectedSourceIds.includes(source.id)

            return (
              <PickerSelectRow
                key={source.id}
                id={source.id}
                checked={isSelected}
                disabled={isAlreadyLinked}
                onCheckedChange={(checked) => handleToggleSource(source.id, checked)}
                leading={getSourceIcon(source)}
                title={source.title}
                meta={
                  isAlreadyLinked ? (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {t('common.linked')}
                    </Badge>
                  ) : null
                }
                description={t('sources.added').replace(
                  '{date}',
                  formatDate(source.created)
                )}
                className={
                  isSelected ? 'bg-accent border-accent-foreground/20' : undefined
                }
              />
            )
          })}
        </div>
      )}
    </PickerDialogShell>
  )
}
