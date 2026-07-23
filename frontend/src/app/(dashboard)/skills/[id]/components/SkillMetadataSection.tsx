'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { SkillDetailPageState } from '@/app/(dashboard)/skills/[id]/hooks/useSkillDetailPage'

type SkillMetadataSectionProps = Pick<
  SkillDetailPageState,
  | 'nameId'
  | 'descriptionId'
  | 'tagsId'
  | 'name'
  | 'setName'
  | 'description'
  | 'setDescription'
  | 'tagsInput'
  | 'setTagsInput'
  | 'metadataDirty'
  | 'setMetadataDirty'
  | 'updateSkill'
  | 'validation'
  | 'handleSaveMetadata'
>

export function SkillMetadataSection(props: SkillMetadataSectionProps) {
  const { t } = useTranslation()

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('skills.metadata')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={props.nameId}>{t('common.name')}</Label>
              <Input
                id={props.nameId}
                value={props.name}
                onChange={(e) => {
                  props.setName(e.target.value)
                  props.setMetadataDirty(true)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={props.tagsId}>{t('skills.tags')}</Label>
              <Input
                id={props.tagsId}
                value={props.tagsInput}
                onChange={(e) => {
                  props.setTagsInput(e.target.value)
                  props.setMetadataDirty(true)
                }}
                placeholder={t('skills.tagsPlaceholder')}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={props.descriptionId}>{t('common.description')}</Label>
            <Textarea
              id={props.descriptionId}
              value={props.description}
              onChange={(e) => {
                props.setDescription(e.target.value)
                props.setMetadataDirty(true)
              }}
              rows={3}
            />
          </div>
          <Button
            onClick={() => void props.handleSaveMetadata()}
            disabled={!props.metadataDirty || props.updateSkill.isPending}
          >
            {props.updateSkill.isPending
              ? t('common.saving')
              : t('skills.saveMetadata')}
          </Button>
        </CardContent>
      </Card>

      {props.validation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {props.validation.valid
                ? t('skills.validationPassed')
                : t('skills.validationFailed')}
            </CardTitle>
          </CardHeader>
          {!props.validation.valid && props.validation.issues.length > 0 && (
            <CardContent>
              <ul className="space-y-2 text-sm">
                {props.validation.issues.map((issue, index) => (
                  <li
                    key={`${issue.message}-${index}`}
                    className="rounded-md border p-2"
                  >
                    <p className="font-medium">
                      [{issue.severity}] {issue.message}
                    </p>
                    {issue.path && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {issue.path}
                      </p>
                    )}
                    {issue.fix && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {issue.fix}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </>
  )
}
