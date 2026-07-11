'use client'

import Link from 'next/link'
import { Archive, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skill } from '@/lib/types/skills'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillCardProps {
  skill: Skill
}

export function SkillCard({ skill }: SkillCardProps) {
  const { t } = useTranslation()

  return (
    <Link href={`/skills/${skill.id}`} className="block">
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{skill.name}</h3>
                <Badge variant="secondary">{skill.status}</Badge>
                {skill.archived && (
                  <Badge variant="outline" className="gap-1">
                    <Archive className="h-3 w-3" />
                    {t('skills.archived')}
                  </Badge>
                )}
              </div>
              {skill.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {skill.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <FileText className="h-3.5 w-3.5" />
              {t('skills.fileCount').replace('{count}', skill.file_count.toString())}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {skill.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {skill.updated && (
            <p className="text-xs text-muted-foreground">
              {t('common.updated_label')}: {new Date(skill.updated).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
