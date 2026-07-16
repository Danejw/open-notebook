'use client'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { CollectionsList } from './components/CollectionsList'
import { useCollections } from '@/lib/hooks/use-collections'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export default function CollectionsPage() {
  const { t } = useTranslation()
  const { data: collections, isLoading, refetch } = useCollections(false)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('collections.title')}
          actions={<PageRefreshButton onClick={() => refetch()} />}
        />

        <div className="max-w-5xl">
          <CollectionsList collections={collections} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}
