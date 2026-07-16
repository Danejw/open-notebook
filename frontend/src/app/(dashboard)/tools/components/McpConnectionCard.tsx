'use client'

import Link from 'next/link'
import { ExternalLink, RefreshCw, Trash2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { McpConnection } from '@/lib/types/mcp'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useSyncMcpConnection,
  useTestMcpConnection,
} from '@/lib/hooks/use-mcp'
import { cn } from '@/lib/utils'
import {
  CompactListRow,
  CompactListRowActions,
  CompactListRowContent,
  CompactListRowMeta,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from '@/components/common/CompactListRow'

interface McpConnectionCardProps {
  connection: McpConnection
  onDelete: (connection: McpConnection) => void
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'connected':
      return 'secondary'
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function McpConnectionCard({ connection, onDelete }: McpConnectionCardProps) {
  const { t } = useTranslation()
  const testConnection = useTestMcpConnection()
  const syncConnection = useSyncMcpConnection()

  const isBusy = testConnection.isPending || syncConnection.isPending
  const toolCount = connection.available_tool_count ?? 0
  const authLabel =
    connection.auth_type === 'bearer'
      ? connection.has_auth_config
        ? t('tools.authBearer')
        : t('tools.authNone')
      : t('tools.authNone')

  return (
    <CompactListRow align="start" className="px-0">
      <CompactListRowContent className="space-y-0.5">
        <CompactListRowTitleRow className="flex-wrap gap-1.5">
          <CompactListRowTitle href={`/tools/${connection.id}`}>
            {connection.name}
          </CompactListRowTitle>
          {connection.status !== 'connected' && (
            <Badge variant={statusBadgeVariant(connection.status)} className="h-4 px-1 text-[10px]">
              {t(`tools.status.${connection.status}`, connection.status)}
            </Badge>
          )}
        </CompactListRowTitleRow>
        <CompactListRowMeta>{connection.endpoint_url}</CompactListRowMeta>
        <CompactListRowMeta>
          {t('tools.toolCount').replace('{count}', String(toolCount))} · {authLabel}
          {connection.last_synced_at && (
            <>
              {' '}
              · {t('tools.lastSynced')}{' '}
              {new Date(connection.last_synced_at).toLocaleDateString()}
            </>
          )}
        </CompactListRowMeta>
        {connection.last_error && (
          <p className="line-clamp-1 text-[11px] text-destructive">{connection.last_error}</p>
        )}
      </CompactListRowContent>

      <CompactListRowActions>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={isBusy}
          onClick={() => testConnection.mutate(connection.id)}
          aria-label={t('tools.test')}
          title={t('tools.test')}
        >
          <Zap className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={isBusy}
          onClick={() => syncConnection.mutate(connection.id)}
          aria-label={t('tools.sync')}
          title={t('tools.sync')}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', syncConnection.isPending && 'animate-pulse opacity-60')}
          />
        </Button>
        <Button asChild variant="ghost" size="icon" className="h-7 w-7">
          <Link href={`/tools/${connection.id}`} aria-label={t('tools.open')} title={t('tools.open')}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          disabled={isBusy}
          onClick={() => onDelete(connection)}
          aria-label={t('tools.delete')}
          title={t('tools.delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CompactListRowActions>
    </CompactListRow>
  )
}
