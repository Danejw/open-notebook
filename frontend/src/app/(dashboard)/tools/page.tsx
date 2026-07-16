'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ResourceList } from '@/components/common/ResourceList'
import { settleBulkActions } from '@/components/common/bulk-settle'
import { McpConnectionCard } from './components/McpConnectionCard'
import { McpConnectionCreateDialog } from './components/McpConnectionCreateDialog'
import { useMcpConnections } from '@/lib/hooks/use-mcp'
import { mcpApi } from '@/lib/api/mcp'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useTranslation } from '@/lib/hooks/use-translation'
import { McpConnection } from '@/lib/types/mcp'

export default function ToolsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: connections, isLoading, refetch } = useMcpConnections()
  const [deleteTarget, setDeleteTarget] = useState<McpConnection | null>(null)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const items = connections ?? []

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await mcpApi.deleteConnection(deleteTarget.id)
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnections })
    setDeleteTarget(null)
  }

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDeleteIds?.length) return
    setBulkBusy(true)
    try {
      const { succeeded, failed } = await settleBulkActions(bulkDeleteIds, (id) =>
        mcpApi.deleteConnection(id)
      )
      if (failed > 0) {
        toast.error(t('common.bulkPartial').replace('{failed}', failed.toString()))
      }
      if (succeeded > 0) {
        toast.success(t('common.bulkSuccess').replace('{count}', succeeded.toString()))
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnections })
      setBulkDeleteIds(null)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className={cn(pageContentClassName, pageSectionGapClassName)}>
          <PageHeader
            title={t('tools.title')}
            actions={
              <div className="flex items-center gap-1">
                <PageRefreshButton onClick={() => refetch()} />
                <McpConnectionCreateDialog />
              </div>
            }
          />

          <div className="max-w-5xl">
            <ResourceList
              title={t('tools.listTitle')}
              items={items}
              getItemId={(connection) => connection.id}
              isLoading={isLoading}
              empty={
                <EmptyState
                  icon={Wrench}
                  title={t('tools.empty')}
                  description={t('tools.emptyDesc')}
                  action={<McpConnectionCreateDialog />}
                />
              }
              formatSelectedCount={(count) =>
                t('common.selectedItems').replace('{count}', count.toString())
              }
              bulkActions={({ selectedIds }) => (
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
              )}
              renderItem={(connection) => (
                <div className="px-3">
                  <McpConnectionCard
                    connection={connection}
                    onDelete={setDeleteTarget}
                  />
                </div>
              )}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('tools.delete')}
        description={t('tools.deleteConfirm').replace('{name}', deleteTarget?.name ?? '')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => void handleConfirmDelete()}
      />

      <ConfirmDialog
        open={Boolean(bulkDeleteIds?.length)}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteIds(null)
        }}
        title={t('tools.delete')}
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
