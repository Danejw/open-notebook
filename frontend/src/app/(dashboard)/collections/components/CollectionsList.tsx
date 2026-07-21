'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Library, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { BulkDeleteConfirmDialog } from '@/components/common/BulkDeleteConfirmDialog'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { ListSelectionBar } from '@/components/common/ListSelectionBar'
import { reportBulkResults, settleBulkActions } from '@/components/common/bulk-settle'
import { Collection } from '@/lib/types/collections'
import { CollectionCard } from './CollectionCard'
import { CollectionImportDialog } from './CollectionImportDialog'
import { collectionsApi } from '@/lib/api/collections'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useListSelection } from '@/lib/hooks/useListSelection'
import { useTranslation } from '@/lib/hooks/use-translation'

interface CollectionsListProps {
  collections: Collection[] | undefined
  isLoading: boolean
}

export function CollectionsList({ collections, isLoading }: CollectionsListProps) {
  const { t } = useTranslation()
  const [importOpen, setImportOpen] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const queryClient = useQueryClient()

  const {
    selectedIds,
    selectionMode,
    selectedList,
    clearSelection,
    enterSelection,
    toggleSelect,
    selectAllVisible,
    isSelected,
  } = useListSelection()

  const items = collections ?? []
  const visibleIds = items.map((collection) => collection.id)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
  }

  const handleBulkArchive = async () => {
    if (selectedList.length === 0) return
    setBulkBusy(true)
    try {
      const { succeeded, failed } = await settleBulkActions(selectedList, (id) =>
        collectionsApi.archive(id)
      )
      reportBulkResults(t, succeeded, failed)
      await invalidate()
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDeleteIds?.length) return
    setBulkBusy(true)
    try {
      const { succeeded, failed } = await settleBulkActions(bulkDeleteIds, (id) =>
        collectionsApi.delete(id)
      )
      reportBulkResults(t, succeeded, failed)
      await invalidate()
      setBulkDeleteIds(null)
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  if (isLoading) {
    return <ListRowsSkeleton rows={5} />
  }

  if (items.length === 0) {
    return (
      <>
        <EmptyState
          icon={Library}
          title={t('collections.empty')}
          description={t('collections.emptyDesc')}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" className="h-7 text-xs" asChild>
                <Link href="/collections/new">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t('collections.create')}
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t('collections.uploadZip')}
              </Button>
            </div>
          }
        />
        <CollectionImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
          <h2 className="text-sm font-semibold leading-none">{t('collections.listTitle')}</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <Link href="/collections/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('collections.create')}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {t('collections.uploadZip')}
            </Button>
          </div>
        </div>

        {selectionMode ? (
          <div className="border-b px-2 py-1.5">
            <ListSelectionBar
              count={selectedIds.size}
              countLabel={t('common.selectedItems').replace(
                '{count}',
                selectedIds.size.toString()
              )}
              onClear={clearSelection}
              onSelectAll={() => selectAllVisible(visibleIds)}
              className="mb-0 sticky top-0"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7"
                disabled={bulkBusy || selectedList.length === 0}
                onClick={() => void handleBulkArchive()}
              >
                <Archive className="mr-1 h-3.5 w-3.5" />
                {t('common.bulkArchive')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-destructive hover:text-destructive"
                disabled={bulkBusy || selectedList.length === 0}
                onClick={() => setBulkDeleteIds(selectedList)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {t('common.bulkDelete')}
              </Button>
            </ListSelectionBar>
          </div>
        ) : null}

        <div className="divide-y">
          {items.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              selectionMode={selectionMode}
              selected={isSelected(collection.id)}
              onToggleSelect={toggleSelect}
              onEnterSelection={enterSelection}
            />
          ))}
        </div>
      </div>

      <CollectionImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <BulkDeleteConfirmDialog
        ids={bulkDeleteIds}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteIds(null)
        }}
        onConfirm={() => void handleBulkDeleteConfirm()}
        isLoading={bulkBusy}
      />
    </>
  )
}
