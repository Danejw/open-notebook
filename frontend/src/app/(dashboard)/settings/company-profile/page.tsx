'use client'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { CompanyProfileForm } from './components/CompanyProfileForm'
import { useOpportunityScoringProfile } from '@/lib/hooks/use-opportunities'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export default function CompanyProfilePage() {
  const { t } = useTranslation()
  const { refetch } = useOpportunityScoringProfile()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={pageContentClassName}>
        <div className={cn('max-w-4xl', pageSectionGapClassName)}>
          <PageHeader
            title={t('navigation.companyProfile')}
            description={t('companyProfile.pageDescription')}
            actions={<PageRefreshButton onClick={() => refetch()} />}
          />

          <CompanyProfileForm />
        </div>
      </div>
    </div>
  )
}
