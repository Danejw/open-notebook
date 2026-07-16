'use client'

import { useState, useEffect } from 'react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useCreateCredential, useUpdateCredential } from '@/lib/hooks/use-credentials'
import { Credential, CreateCredentialRequest, UpdateCredentialRequest } from '@/lib/api/credentials'
import { PROVIDER_DISPLAY_NAMES, PROVIDER_DOCS, PROVIDER_MODALITIES } from '@/components/settings/apiKeysShared'

export interface CredentialFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: string
  credential?: Credential | null
}

export function CredentialFormDialog({
  open,
  onOpenChange,
  provider,
  credential,
}: CredentialFormDialogProps) {
  const { t } = useTranslation()
  const createCredential = useCreateCredential()
  const updateCredential = useUpdateCredential()
  const isEditing = !!credential
  const isSubmitting = createCredential.isPending || updateCredential.isPending

  const isVertex = provider === 'vertex'
  const isOllama = provider === 'ollama'
  const isOpenAICompatible = provider === 'openai_compatible'
  const requiresApiKey = !isVertex && !isOllama && !isOpenAICompatible

  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [project, setProject] = useState('')
  const [location, setLocation] = useState('')
  const [credentialsPath, setCredentialsPath] = useState('')
  const [numCtx, setNumCtx] = useState('')
  const [modalities, setModalities] = useState<string[]>([])

  useEffect(() => {
    if (credential) {
      setName(credential.name || '')
      setBaseUrl(credential.base_url || '')
      setApiKey('')
      setProject(credential.project || '')
      setLocation(credential.location || '')
      setCredentialsPath(credential.credentials_path || '')
      setNumCtx(credential.num_ctx ? String(credential.num_ctx) : '')
      setModalities(credential.modalities || [])
    } else {
      setName('')
      setBaseUrl('')
      setApiKey('')
      setProject('')
      setLocation('')
      setCredentialsPath('')
      setNumCtx('')
      setModalities(PROVIDER_MODALITIES[provider] || ['language'])
    }
  }, [credential, provider])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const onSuccess = () => {
      onOpenChange(false)
    }

    if (isEditing && credential) {
      const data: UpdateCredentialRequest = {}
      if (name !== credential.name) data.name = name
      if (apiKey.trim()) data.api_key = apiKey.trim()
      if (baseUrl !== (credential.base_url || '')) data.base_url = baseUrl || undefined
      if (JSON.stringify(modalities) !== JSON.stringify(credential.modalities)) data.modalities = modalities
      if (isVertex) {
        if (project !== (credential.project || '')) data.project = project.trim() || undefined
        if (location !== (credential.location || '')) data.location = location.trim() || undefined
        if (credentialsPath !== (credential.credentials_path || '')) data.credentials_path = credentialsPath.trim() || undefined
      }
      if (isOllama && numCtx !== (credential.num_ctx ? String(credential.num_ctx) : '')) {
        data.num_ctx = numCtx.trim() ? Number(numCtx) : 0
      }
      updateCredential.mutate({ credentialId: credential.id, data }, { onSuccess })
    } else {
      const data: CreateCredentialRequest = {
        name: name || `${PROVIDER_DISPLAY_NAMES[provider] || provider} Config`,
        provider,
        modalities,
        api_key: apiKey.trim() || undefined,
        base_url: baseUrl || undefined,
      }
      if (isVertex) {
        data.project = project.trim() || undefined
        data.location = location.trim() || undefined
        data.credentials_path = credentialsPath.trim() || undefined
      }
      if (isOllama && numCtx.trim()) {
        data.num_ctx = Number(numCtx)
      }
      createCredential.mutate(data, { onSuccess })
    }
  }

  const isValid = isEditing
    ? true
    : isVertex
      ? name.trim() !== '' && project.trim() !== '' && location.trim() !== ''
      : name.trim() !== '' && (!requiresApiKey || apiKey.trim() !== '')

  const docsUrl = PROVIDER_DOCS[provider]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('apiKeys.editConfig').replace('{provider}', PROVIDER_DISPLAY_NAMES[provider] || provider)
              : t('apiKeys.addConfig').replace('{provider}', PROVIDER_DISPLAY_NAMES[provider] || provider)}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cred-name">{t('apiKeys.configName')}</Label>
            <Input
              id="cred-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${PROVIDER_DISPLAY_NAMES[provider] || provider} Production`}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">{t('apiKeys.configNameHint')}</p>
          </div>

          {isVertex ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="vertex-project">{t('apiKeys.vertexProject')}</Label>
                <Input
                  id="vertex-project"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="my-gcp-project"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vertex-location">{t('apiKeys.vertexLocation')}</Label>
                <Input
                  id="vertex-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="us-central1"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vertex-creds">
                  {t('apiKeys.vertexCredentials')}
                  <span className="text-muted-foreground font-normal ml-1">({t('common.optional')})</span>
                </Label>
                <Input
                  id="vertex-creds"
                  value={credentialsPath}
                  onChange={(e) => setCredentialsPath(e.target.value)}
                  placeholder="/path/to/service-account.json"
                  disabled={isSubmitting}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="api-key">
                {t('models.apiKey')}
                {!requiresApiKey && <span className="text-muted-foreground font-normal ml-1">({t('common.optional')})</span>}
              </Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  className="pr-10"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isEditing ? '••••••••••••' : 'sk-...'}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  tabIndex={-1}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              {isEditing && <p className="text-xs text-muted-foreground">{t('apiKeys.apiKeyEditHint')}</p>}
              {docsUrl && (
                <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  {t('apiKeys.getApiKey')} &rarr;
                </a>
              )}
            </div>
          )}

          {!isVertex && (
            <div className="space-y-2">
              <Label htmlFor="base-url" className="text-muted-foreground">{t('apiKeys.baseUrl')}</Label>
              <Input
                id="base-url"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={isOllama ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">{t('apiKeys.baseUrlOverrideHint')}</p>
            </div>
          )}

          {isOllama && (
            <div className="space-y-2">
              <Label htmlFor="num-ctx" className="text-muted-foreground">
                {t('apiKeys.numCtx')}
                <span className="text-muted-foreground font-normal ml-1">({t('common.optional')})</span>
              </Label>
              <Input
                id="num-ctx"
                type="number"
                min={1}
                value={numCtx}
                onChange={(e) => setNumCtx(e.target.value)}
                placeholder="8192"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">{t('apiKeys.numCtxHint')}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting && <InlineSkeleton className="mr-2" />}
              {isEditing ? t('common.save') : t('apiKeys.addConfig')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
