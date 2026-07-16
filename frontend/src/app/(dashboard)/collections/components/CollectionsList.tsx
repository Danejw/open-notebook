'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Library, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ResourceList } from '@/components/common/ResourceList'
import { settleBulkActions } from '@/components/common/bulk-settle'
import { Collection } from '@/lib/types/collections'
import { CollectionCard } from './CollectionCard'
import { CollectionImportDialog } from './CollectionImportDialog'
import { collectionsApi } from '@/lib/api/collections'
import { QUERY_KEYS } from '@/lib/api/query-client'
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

  const items = collections ?? []

  const reportBulk = (succeeded: number, failed: number) => {
    if (failed > 0) {
      toast.error(t('common.bulkPartial').replace('{failed}', failed.toString()))
    }
    if (succeeded > 0) {
      toast.success(t('common.bulkSuccess').replace('{count}', succeeded.toString()))
    }
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
  }

  const handleBulkArchive = async (selectedIds: string[], exitSelection: () => void) => {
    setBulkBusy(true)
    try {
      const { succeeded, failed } = await settleBulkActions(selectedIds, (id) =>
        collectionsApi.archive(id)
      )
      reportBulk(succeeded, failed)
      await invalidate()
      exitSelection()
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
      reportBulk(succeeded, failed)
      await invalidate()
      setBulkDeleteIds(null)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <>
      <ResourceList
        title={t('collections.listTitle')}
        items={items}
        getItemId={(collection) => collection.id}
        isLoading={isLoading}
        empty={
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
        }
        headerActions={
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
        }
        formatSelectedCount={(count) =>
          t('common.selectedItems').replace('{count}', count.toString())
        }
        bulkActions={({ selectedIds, exitSelection }) => (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={bulkBusy || selectedIds.length === 0}
              onClick={() => void handleBulkArchive(selectedIds, exitSelection)}
            >
              <Archive className="mr-1 h-3.5 w-3.5" />
              {t('common.bulkArchive')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              disabled={bulkBusy || selectedIds.length === 0}
              onClick={() => setBulkDeleteIds(selectedIds)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('common.bulkDelete')}
            </Button>
          </>
        )}
        renderItem={(collection, ctx) => (
          <CollectionCard
            collection={collection}
            selectionMode={ctx.selectionMode}
            onSelectToggle={() => ctx.onToggle(!ctx.selected)}
          />
        )}
      />

      <CollectionImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <ConfirmDialog
        open={Boolean(bulkDeleteIds?.length)}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteIds(null)
        }}
        title={t('common.delete')}
        description={t('common.bulkDeleteConfirm').replace(
          '{count}',
          String(bulkDeleteIds?.length ?? 0)
        )}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => void handleBulkDeleteConfirm()}
        isLoading={bulkBusy}
      />
    </>
  )
}
