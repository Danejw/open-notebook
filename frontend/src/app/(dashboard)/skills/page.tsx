'use client'

import { AppShell } from '@/components/layout/AppShell'
import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { SkillsList } from './components/SkillsList'
import { useSkills } from '@/lib/hooks/use-skills'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function SkillsPage() {
  const { t } = useTranslation()
  const { data: skills, isLoading, refetch } = useSkills(false)

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className={`${pageContentClassName} space-y-6`}>
          <PageHeader
            bordered
            icon={Sparkles}
            title={t('skills.title')}
            description={t('skills.desc')}
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
    </AppShell>
  )
}
