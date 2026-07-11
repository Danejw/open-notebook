'use client'

import { useState } from 'react'
import { Upload, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
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
    return <ListRowsSkeleton rows={5} />
  }

  if (!skills || skills.length === 0) {
    return (
      <>
        <EmptyState
          icon={Sparkles}
          title={t('skills.empty')}
          description={t('skills.emptyDesc')}
          action={
            <Button size="sm" className="h-7 text-xs" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
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
      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold leading-none">{t('skills.listTitle')}</h2>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {t('skills.uploadZip')}
          </Button>
        </div>

        <div className="divide-y">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      </div>

      <SkillImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
