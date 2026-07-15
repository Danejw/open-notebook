'use client'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { RebuildEmbeddings } from './components/RebuildEmbeddings'
import { SystemInfo } from './components/SystemInfo'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export default function AdvancedPage() {
  const { t } = useTranslation()
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={pageContentClassName}>
        <div className={cn('mx-auto max-w-4xl', pageSectionGapClassName)}>
          <PageHeader
            title={t('advanced.title')}
          />

          <SystemInfo />
          <RebuildEmbeddings />
        </div>
      </div>
    </div>
  )
}
