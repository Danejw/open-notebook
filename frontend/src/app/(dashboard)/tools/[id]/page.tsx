'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, KeyRound, RefreshCw, Zap } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { DetailPageSkeleton, ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { PageError } from '@/components/common/PageError'
import { McpAuthFields } from '@/components/mcp/McpAuthFields'
import { McpToolRiskBadge } from '@/components/mcp/McpToolRiskBadge'
import {
  useMcpConnection,
  useMcpConnectionTools,
  useSyncMcpConnection,
  useTestMcpConnection,
  useUpdateMcpConnectionAuth,
} from '@/lib/hooks/use-mcp'
import { useTranslation } from '@/lib/hooks/use-translation'
import { McpAuthType } from '@/lib/types/mcp'
import { cn } from '@/lib/utils'

function JsonBlock({ value }: { value: object | null | undefined }) {
  if (!value || Object.keys(value).length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <pre className="max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px]">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function ToolSchemaCell({ schema }: { schema: object | null | undefined }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!schema || Object.keys(schema).length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <div>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setOpen((v) => !v)}>
        {open ? t('tools.hideSchema') : t('tools.showSchema')}
      </Button>
      {open && <JsonBlock value={schema} />}
    </div>
  )
}

export default function ToolConnectionDetailPage() {
  const { t } = useTranslation()
  const params = useParams<{ id: string }>()
  const connectionId = params.id

  const { data: connection, isLoading, refetch } = useMcpConnection(connectionId)
  const { data: tools = [], isLoading: toolsLoading, refetch: refetchTools } =
    useMcpConnectionTools(connectionId)
  const testConnection = useTestMcpConnection()
  const syncConnection = useSyncMcpConnection()
  const updateAuth = useUpdateMcpConnectionAuth()

  const [authOpen, setAuthOpen] = useState(false)
  const [authType, setAuthType] = useState<McpAuthType>('bearer')
  const [bearerToken, setBearerToken] = useState('')

  useEffect(() => {
    if (!connection || !authOpen) return
    setAuthType(connection.auth_type === 'none' ? 'none' : 'bearer')
    setBearerToken('')
  }, [connection, authOpen])

  const sortedTools = useMemo(
    () => [...tools].sort((a, b) => a.name.localeCompare(b.name)),
    [tools]
  )

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchTools()])
  }

  const handleSync = async () => {
    await syncConnection.mutateAsync(connectionId)
    await refetchTools()
  }

  const handleSaveAuth = async () => {
    await updateAuth.mutateAsync({
      id: connectionId,
      data: {
        auth_type: authType,
        bearer_token: authType === 'bearer' ? bearerToken.trim() || undefined : undefined,
      },
    })
    setAuthOpen(false)
    setBearerToken('')
  }

  if (isLoading) {
    return (
              <div className="flex-1 overflow-y-auto">
          <DetailPageSkeleton />
        </div>
    )
  }

  if (!connection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <PageError
          title={t('tools.notFound')}
          tone="muted"
          centered
          action={
            <Button asChild variant="outline">
              <Link href="/tools">{t('tools.backToList')}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-6xl">
          <PageHeader
            leading={
              <Button asChild variant="ghost" size="sm" className="-ml-1 mb-1 h-7 px-2 text-xs">
                <Link href="/tools">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  {t('tools.backToList')}
                </Link>
              </Button>
            }
            title={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {connection.name}
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                  {t(`tools.status.${connection.status}`, connection.status)}
                </Badge>
              </span>
            }
            description={connection.endpoint_url}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => testConnection.mutate(connectionId)}
                  disabled={testConnection.isPending}
                >
                  <Zap className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('tools.test')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleSync}
                  disabled={syncConnection.isPending}
                >
                  <RefreshCw
                    className={cn('h-3.5 w-3.5 sm:mr-1.5', syncConnection.isPending && 'animate-pulse opacity-60')}
                  />
                  <span className="hidden sm:inline">{t('tools.sync')}</span>
                </Button>
                <PageRefreshButton
                  showLabel
                  className="h-7 px-2 text-xs"
                  iconClassName="sm:mr-1.5"
                  labelClassName="hidden sm:inline"
                  onClick={handleRefresh}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setAuthOpen(true)}
                >
                  <KeyRound className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('tools.replaceAuth')}</span>
                </Button>
              </>
            }
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('tools.serverInfo')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonBlock value={connection.server_info ?? undefined} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('tools.capabilities')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonBlock value={connection.capabilities ?? undefined} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('tools.metadata')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-2">
              <p>
                <span className="text-muted-foreground">{t('tools.authType')}:</span>{' '}
                {connection.auth_type}
              </p>
              <p>
                <span className="text-muted-foreground">{t('tools.authConfigured')}:</span>{' '}
                {connection.has_auth_config ? t('common.yes') : t('common.no')}
              </p>
              {connection.last_connected_at && (
                <p>
                  <span className="text-muted-foreground">{t('tools.lastConnected')}:</span>{' '}
                  {new Date(connection.last_connected_at).toLocaleString()}
                </p>
              )}
              {connection.last_synced_at && (
                <p>
                  <span className="text-muted-foreground">{t('tools.lastSynced')}:</span>{' '}
                  {new Date(connection.last_synced_at).toLocaleString()}
                </p>
              )}
              {connection.last_error && (
                <p className="md:col-span-2 text-destructive">
                  <span className="text-muted-foreground">{t('tools.lastError')}:</span>{' '}
                  {connection.last_error}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('tools.discoveredTools')}</CardTitle>
            </CardHeader>
            <CardContent>
              {toolsLoading ? (
                <ListRowsSkeleton rows={4} withHeader={false} />
              ) : sortedTools.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t('tools.noTools')}</p>
              ) : (
                <div className="space-y-3">
                  {sortedTools.map((tool) => (
                    <div key={tool.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">{tool.title || tool.name}</p>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground">{tool.description}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <McpToolRiskBadge risk={tool.risk_level} />
                          <Badge variant={tool.available ? 'secondary' : 'outline'}>
                            {tool.available ? t('tools.available') : t('tools.unavailable')}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {t('tools.inputSchema')}
                          </p>
                          <ToolSchemaCell schema={tool.input_schema} />
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {t('tools.outputSchema')}
                          </p>
                          <ToolSchemaCell schema={tool.output_schema} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <FormDialogShell
        open={authOpen}
        onOpenChange={setAuthOpen}
        title={t('tools.replaceAuth')}
        description={t('tools.replaceAuthDesc')}
        isSubmitting={updateAuth.isPending}
        onSubmit={(event) => {
          event.preventDefault()
          void handleSaveAuth()
        }}
      >
        <McpAuthFields
          authType={authType}
          onAuthTypeChange={setAuthType}
          bearerToken={bearerToken}
          onBearerTokenChange={setBearerToken}
          tokenLabel={t('tools.newBearerToken')}
          tokenHint={t('tools.tokenNotShown')}
          tokenAutoComplete="new-password"
          className="space-y-4"
        />
      </FormDialogShell>
    </>
  )
}
