'use client'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { SkillsList } from './components/SkillsList'
import { useSkills } from '@/lib/hooks/use-skills'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export default function SkillsPage() {
  const { t } = useTranslation()
  const { data: skills, isLoading, refetch } = useSkills(false)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('skills.title')}
          actions={
            <PageRefreshButton onClick={() => refetch()} />
          }
        />

        <div className="max-w-5xl">
          <SkillsList skills={skills} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}
