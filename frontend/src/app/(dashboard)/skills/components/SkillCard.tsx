'use client'

import { Archive, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skill } from '@/lib/types/skills'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  CompactListRow,
  CompactListRowContent,
  CompactListRowIcon,
  CompactListRowMeta,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from '@/components/common/CompactListRow'

interface SkillCardProps {
  skill: Skill
  /** When true, row is not a navigation link (bulk selection). */
  selectionMode?: boolean
  onSelectToggle?: () => void
}

function shouldShowStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized !== '' && normalized !== 'active'
}

export function SkillCard({ skill, selectionMode = false, onSelectToggle }: SkillCardProps) {
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
    <CompactListRow
      href={selectionMode ? undefined : `/skills/${skill.id}`}
      onClick={selectionMode ? () => onSelectToggle?.() : undefined}
    >
      <CompactListRowIcon>
        <Sparkles aria-hidden />
      </CompactListRowIcon>
      <CompactListRowContent>
        <CompactListRowTitleRow className="gap-2">
          <CompactListRowTitle>{skill.name}</CompactListRowTitle>
          {skill.archived ? (
            <Badge variant="outline" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
              <Archive className="h-3 w-3" />
              {t('skills.archived')}
            </Badge>
          ) : null}
        </CompactListRowTitleRow>
        <CompactListRowMeta>
          {skill.description ? (
            <>
              <span>{skill.description}</span>
              <span aria-hidden> · </span>
            </>
          ) : null}
          {metaParts.join(' · ')}
        </CompactListRowMeta>
      </CompactListRowContent>
    </CompactListRow>
  )
}
