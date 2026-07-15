'use client'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { SkillsList } from './components/SkillsList'
import { useSkills } from '@/lib/hooks/use-skills'
import { RefreshCw } from 'lucide-react'
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
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => refetch()} aria-label={t('common.refresh')}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          }
        />

        <div className="max-w-5xl">
          <SkillsList skills={skills} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}
