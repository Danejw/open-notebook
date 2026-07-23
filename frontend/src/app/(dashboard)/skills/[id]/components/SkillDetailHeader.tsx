'use client'

import Link from 'next/link'
import {
  Archive,
  ArrowLeft,
  Download,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { SkillDetailPageState } from '@/app/(dashboard)/skills/[id]/hooks/useSkillDetailPage'

type SkillDetailHeaderProps = Pick<
  SkillDetailPageState,
  | 'skill'
  | 'dirty'
  | 'metadataDirty'
  | 'validateSkill'
  | 'exportSkill'
  | 'archiveSkill'
  | 'handleValidate'
  | 'handleArchive'
  | 'setShowDeleteSkill'
>

export function SkillDetailHeader(props: SkillDetailHeaderProps) {
  const { t } = useTranslation()
  const skill = props.skill
  if (!skill) return null

  return (
    <PageHeader
      leading={
        <Button asChild variant="ghost" size="sm" className="-ml-1 mb-1 h-7 px-2 text-xs">
          <Link href="/skills">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            {t('skills.backToList')}
          </Link>
        </Button>
      }
      title={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {skill.name}
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {skill.status}
          </Badge>
          {skill.archived ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
              {t('skills.archived')}
            </Badge>
          ) : null}
        </span>
      }
      description={
        props.dirty || props.metadataDirty ? (
          <span className="text-amber-600 dark:text-amber-400">
            {t('skills.unsavedChanges')}
          </span>
        ) : undefined
      }
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void props.handleValidate()}
            disabled={props.validateSkill.isPending}
          >
            <ShieldCheck className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t('skills.validate')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => props.exportSkill.mutate(skill.id)}
            disabled={props.exportSkill.isPending}
          >
            <Download className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t('skills.export')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void props.handleArchive()}
            disabled={props.archiveSkill.isPending}
          >
            <Archive className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">
              {skill.archived ? t('skills.unarchive') : t('skills.archive')}
            </span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => props.setShowDeleteSkill(true)}
          >
            <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t('common.delete')}</span>
          </Button>
        </>
      }
    />
  )
}
