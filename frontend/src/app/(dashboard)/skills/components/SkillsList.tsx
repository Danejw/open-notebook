'use client'

import { useState } from 'react'
import { Upload, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Skill } from '@/lib/types/skills'
import { SkillCard } from './SkillCard'
import { SkillImportDialog } from './SkillImportDialog'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillsListProps {
  skills: Skill[] | undefined
  isLoading: boolean
}

export function SkillsList({ skills, isLoading }: SkillsListProps) {
  const { t } = useTranslation()
  const [importOpen, setImportOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!skills || skills.length === 0) {
    return (
      <>
        <EmptyState
          icon={Sparkles}
          title={t('skills.empty')}
          description={t('skills.emptyDesc')}
          action={
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {t('skills.uploadZip')}
            </Button>
          }
        />
        <SkillImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">{t('skills.listTitle')}</h2>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t('skills.uploadZip')}
          </Button>
        </div>

        <div className="space-y-4">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      </div>

      <SkillImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
