'use client'

import { useMemo } from 'react'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { SettingsFormSkeleton } from '@/components/common/LoadingSkeletons'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useModels, useModelDefaults } from '@/lib/hooks/use-models'
import {
  useCredentials,
  useCredentialStatus,
  useEnvStatus,
} from '@/lib/hooks/use-credentials'
import { Credential } from '@/lib/api/credentials'
import {
  MigrationBanner,
  DefaultModelSelectors,
  ProviderSection,
} from '@/components/settings'
import { ALL_PROVIDERS } from '@/components/settings/apiKeysShared'

export default function ApiKeysPage() {
  const { t } = useTranslation()

  const { data: credentials, isLoading: credentialsLoading } = useCredentials()
  const { data: models, isLoading: modelsLoading } = useModels()
  const { data: defaults, isLoading: defaultsLoading } = useModelDefaults()
  const { data: credentialStatus } = useCredentialStatus()
  const { data: envStatus } = useEnvStatus()

  const encryptionReady = credentialStatus?.encryption_configured ?? true

  const credentialsByProvider = useMemo(() => {
    const grouped: Record<string, Credential[]> = {}
    for (const provider of ALL_PROVIDERS) {
      grouped[provider] = []
    }
    if (credentials) {
      for (const cred of credentials) {
        if (!grouped[cred.provider]) grouped[cred.provider] = []
        grouped[cred.provider].push(cred)
      }
    }
    return grouped
  }, [credentials])

  const providersToMigrate = useMemo(() => {
    if (!envStatus || !credentialStatus) return []
    const providers: string[] = []
    for (const provider in envStatus) {
      if (envStatus[provider] && credentialStatus.source[provider] === 'environment') {
        providers.push(provider)
      }
    }
    return providers
  }, [envStatus, credentialStatus])

  const sortedProviders = useMemo(() => {
    return [...ALL_PROVIDERS].sort((a, b) => {
      const aHas = (credentialsByProvider[a]?.length || 0) > 0 ? 1 : 0
      const bHas = (credentialsByProvider[b]?.length || 0) > 0 ? 1 : 0
      return bHas - aHas
    })
  }, [credentialsByProvider])

  const isLoading = credentialsLoading || modelsLoading || defaultsLoading

  if (isLoading) {
    return (
      <div className={`${pageContentClassName} ${pageSectionGapClassName}`}>
        <PageHeader title={t('apiKeys.title')} />
        <SettingsFormSkeleton />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`${pageContentClassName} ${pageSectionGapClassName}`}>
        <PageHeader title={t('apiKeys.title')} />

        {!encryptionReady && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>{t('apiKeys.encryptionRequired')}</AlertTitle>
            <AlertDescription>
              <code className="text-xs bg-destructive/10 px-1 py-0.5 rounded">
                {t('apiKeys.encryptionRequiredDescription')}
              </code>
            </AlertDescription>
          </Alert>
        )}

        {encryptionReady && <MigrationBanner providersToMigrate={providersToMigrate} />}

        {models && defaults && (
          <DefaultModelSelectors models={models} defaults={defaults} />
        )}

        <div className="grid gap-4">
          {sortedProviders.map(provider => (
            <ProviderSection
              key={provider}
              provider={provider}
              credentials={credentialsByProvider[provider] || []}
              models={models || []}
              defaults={defaults || null}
              allCredentials={credentials || []}
              encryptionReady={encryptionReady}
            />
          ))}
        </div>

        <div className="border-t pt-4">
          <a
            href="https://github.com/lfnovo/construction-os/blob/main/docs/5-CONFIGURATION/ai-providers.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {t('apiKeys.learnMore')}
          </a>
        </div>
      </div>
    </div>
  )
}
