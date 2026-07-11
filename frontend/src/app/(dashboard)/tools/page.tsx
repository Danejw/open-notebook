'use client'

import { useState } from 'react'
import { Wrench, RefreshCw } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
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
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className={`${pageContentClassName} space-y-6`}>
          <PageHeader
            bordered
            icon={Wrench}
            title={t('tools.title')}
            description={t('tools.desc')}
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => refetch()}
                  aria-label={t('common.refresh')}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <McpConnectionCreateDialog />
              </div>
            }
          />

          <div className="max-w-5xl">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : !connections || connections.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title={t('tools.empty')}
                description={t('tools.emptyDesc')}
                action={<McpConnectionCreateDialog />}
              />
            ) : (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">{t('tools.listTitle')}</h2>
                <div className="divide-y rounded-md border px-3">
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
    </AppShell>
  )
}
