'use client'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { SettingsForm } from './components/SettingsForm'
import { useSettings } from '@/lib/hooks/use-settings'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { refetch } = useSettings()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={pageContentClassName}>
        <div className={cn('max-w-4xl', pageSectionGapClassName)}>
          <PageHeader
            title={t('navigation.settings')}
            actions={
              <PageRefreshButton onClick={() => refetch()} />
            }
          />

          <SettingsForm />
        </div>
      </div>
    </div>
  )
}
