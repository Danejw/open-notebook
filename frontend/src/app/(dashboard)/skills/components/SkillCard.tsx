'use client'

import Link from 'next/link'
import { Archive, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skill } from '@/lib/types/skills'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillCardProps {
  skill: Skill
}

function shouldShowStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized !== '' && normalized !== 'active'
}

export function SkillCard({ skill }: SkillCardProps) {
  const { t } = useTranslation()

  const metaParts: string[] = []
  if (shouldShowStatus(skill.status)) {
    metaParts.push(skill.status)
  }
  metaParts.push(t('skills.fileCount').replace('{count}', skill.file_count.toString()))
  if (skill.updated) {
    metaParts.push(new Date(skill.updated).toLocaleDateString())
  }

  return (
    <Link href={`/skills/${skill.id}`} className="block">
      <div className="group flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/40">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{skill.name}</span>
            {skill.archived ? (
              <Badge variant="outline" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
                <Archive className="h-3 w-3" />
                {t('skills.archived')}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {skill.description ? (
              <>
                <span>{skill.description}</span>
                <span aria-hidden> · </span>
              </>
            ) : null}
            {metaParts.join(' · ')}
          </p>
        </div>
      </div>
    </Link>
  )
}
