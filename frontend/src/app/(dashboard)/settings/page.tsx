'use client'

import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { SettingsForm } from './components/SettingsForm'
import { useSettings } from '@/lib/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { refetch } = useSettings()

  return (
          <div className="flex-1 overflow-y-auto">
        <div className={pageContentClassName}>
          <div className="max-w-4xl">
            <PageHeader
              bordered
              title={t('navigation.settings')}
              actions={
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => refetch()} aria-label={t('common.refresh')}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              }
            />

            <SettingsForm />
          </div>
        </div>
      </div>
  )
}
