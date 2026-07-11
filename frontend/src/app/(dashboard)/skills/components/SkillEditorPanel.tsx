'use client'

import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillEditorPanelProps {
  path: string | null
  content: string
  dirty: boolean
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
}

function isMarkdownPath(path: string | null) {
  return !!path && path.toLowerCase().endsWith('.md')
}

export function SkillEditorPanel({
  path,
  content,
  dirty,
  saving,
  onChange,
  onSave,
}: SkillEditorPanelProps) {
  const { t } = useTranslation()

  if (!path) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
        {t('skills.selectFile')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate font-mono">{path}</p>
          {dirty && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('skills.unsavedChanges')}
            </p>
          )}
        </div>
        <Button type="button" onClick={onSave} disabled={!dirty || saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>

      {isMarkdownPath(path) ? (
        <MarkdownEditor
          value={content}
          onChange={(value) => onChange(value ?? '')}
          height={480}
          preview="live"
        />
      ) : (
        <Textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[480px] font-mono text-sm"
        />
      )}
    </div>
  )
}
