'use client'

import { AppShell } from '@/components/layout/AppShell'
import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { RebuildEmbeddings } from './components/RebuildEmbeddings'
import { SystemInfo } from './components/SystemInfo'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function AdvancedPage() {
  const { t } = useTranslation()
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className={pageContentClassName}>
          <div className="max-w-4xl mx-auto space-y-4">
            <PageHeader
              bordered
              title={t('advanced.title')}
              description={t('advanced.desc')}
            />

            <SystemInfo />
            <RebuildEmbeddings />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
