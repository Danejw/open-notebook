'use client'

import { AppShell } from '@/components/layout/AppShell'
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
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6" />
                <h1 className="text-2xl font-bold">{t('skills.title')}</h1>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="max-w-5xl">
            <p className="text-muted-foreground">{t('skills.desc')}</p>
          </div>

          <div className="max-w-5xl">
            <SkillsList skills={skills} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
