'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  dialogBodyClassName,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateMcpConnection } from '@/lib/hooks/use-mcp'
import { useTranslation } from '@/lib/hooks/use-translation'
import { McpAuthType } from '@/lib/types/mcp'
import { cn } from '@/lib/utils'

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
  const authTypeId = useId()
  const tokenId = useId()

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-7 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t('tools.addConnection')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tools.addConnection')}</DialogTitle>
        </DialogHeader>

        <div className={cn(dialogBodyClassName, 'space-y-3')}>
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
          <div className="space-y-1.5">
            <Label htmlFor={authTypeId}>{t('tools.authType')}</Label>
            <Select value={authType} onValueChange={(value: McpAuthType) => setAuthType(value)}>
              <SelectTrigger id={authTypeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('tools.authNone')}</SelectItem>
                <SelectItem value="bearer">{t('tools.authBearer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {authType === 'bearer' && (
            <div className="space-y-1.5">
              <Label htmlFor={tokenId}>{t('tools.bearerToken')}</Label>
              <Input
                id={tokenId}
                type="password"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder={t('tools.bearerTokenPlaceholder')}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            className="h-7"
            onClick={handleCreate}
            disabled={!name.trim() || !endpointUrl.trim() || createConnection.isPending}
          >
            {createConnection.isPending ? t('common.creating') : t('tools.addConnection')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
