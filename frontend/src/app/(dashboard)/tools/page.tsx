'use client'

import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { McpConnectionCard } from './components/McpConnectionCard'
import { McpConnectionCreateDialog } from './components/McpConnectionCreateDialog'
import { useMcpConnections, useDeleteMcpConnection } from '@/lib/hooks/use-mcp'
import { useTranslation } from '@/lib/hooks/use-translation'
import { McpConnection } from '@/lib/types/mcp'

export default function ToolsPage() {
  const { t } = useTranslation()
  const { data: connections, isLoading, refetch } = useMcpConnections()
  const deleteConnection = useDeleteMcpConnection()
  const [deleteTarget, setDeleteTarget] = useState<McpConnection | null>(null)

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await deleteConnection.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
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
            {isLoading ? (
              <ListRowsSkeleton rows={4} />
            ) : !connections || connections.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title={t('tools.empty')}
                description={t('tools.emptyDesc')}
                action={<McpConnectionCreateDialog />}
              />
            ) : (
              <div className="overflow-hidden rounded-md border">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
                  <h2 className="text-sm font-semibold leading-none">{t('tools.listTitle')}</h2>
                </div>
                <div className="divide-y px-3">
                  {connections.map((connection) => (
                    <McpConnectionCard
                      key={connection.id}
                      connection={connection}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </div>
            )}
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
        onConfirm={handleConfirmDelete}
        isLoading={deleteConnection.isPending}
      />
    </>
  )
}
