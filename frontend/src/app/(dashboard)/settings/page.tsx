'use client'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { SettingsForm } from './components/SettingsForm'
import { useSettings } from '@/lib/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
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
