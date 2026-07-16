'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { McpAuthFields } from '@/components/mcp/McpAuthFields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateMcpConnection } from '@/lib/hooks/use-mcp'
import { useTranslation } from '@/lib/hooks/use-translation'
import { McpAuthType } from '@/lib/types/mcp'

interface McpConnectionCreateDialogProps {
  trigger?: ReactNode
}

export function McpConnectionCreateDialog({ trigger }: McpConnectionCreateDialogProps) {
  const { t } = useTranslation()
  const createConnection = useCreateMcpConnection()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [endpointUrl, setEndpointUrl] = useState('')
  const [authType, setAuthType] = useState<McpAuthType>('none')
  const [bearerToken, setBearerToken] = useState('')

  const nameId = useId()
  const endpointId = useId()

  useEffect(() => {
    if (!open) {
      setName('')
      setEndpointUrl('')
      setAuthType('none')
      setBearerToken('')
    }
  }, [open])

  const handleCreate = async () => {
    if (!name.trim() || !endpointUrl.trim()) return
    await createConnection.mutateAsync({
      name: name.trim(),
      endpoint_url: endpointUrl.trim(),
      transport: 'streamable_http',
      auth_type: authType,
      bearer_token: authType === 'bearer' ? bearerToken.trim() || undefined : undefined,
    })
    setOpen(false)
  }

  return (
    <FormDialogShell
      open={open}
      onOpenChange={setOpen}
      title={t('tools.addConnection')}
      contentClassName="sm:max-w-md"
      compactFooter
      submitLabel={t('tools.addConnection')}
      submittingLabel={t('common.creating')}
      disableSubmit={!name.trim() || !endpointUrl.trim()}
      isSubmitting={createConnection.isPending}
      trigger={
        trigger ?? (
          <Button size="sm" className="h-7 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t('tools.addConnection')}
          </Button>
        )
      }
      onSubmit={(event) => {
        event.preventDefault()
        void handleCreate()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>{t('common.name')}</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('tools.namePlaceholder')}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={endpointId}>{t('tools.endpointUrl')}</Label>
        <Input
          id={endpointId}
          value={endpointUrl}
          onChange={(e) => setEndpointUrl(e.target.value)}
          placeholder="https://example.com/mcp"
        />
      </div>
      <McpAuthFields
        authType={authType}
        onAuthTypeChange={setAuthType}
        bearerToken={bearerToken}
        onBearerTokenChange={setBearerToken}
      />
    </FormDialogShell>
  )
}
