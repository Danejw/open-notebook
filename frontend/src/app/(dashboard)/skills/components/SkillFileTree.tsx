'use client'

import { File, FilePlus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SkillFile } from '@/lib/types/skills'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { listActionTriggerClassName } from '@/lib/utils/list-action-trigger'

interface SkillFileTreeProps {
  files: SkillFile[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onCreate: () => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
}

export function SkillFileTree({
  files,
  selectedPath,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: SkillFileTreeProps) {
  const { t } = useTranslation()
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('skills.files')}</h3>
        <Button type="button" variant="outline" size="sm" onClick={onCreate}>
          <FilePlus className="h-4 w-4 mr-1" />
          {t('skills.newFile')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('skills.noFiles')}</p>
      ) : (
        <ul className="space-y-1 rounded-md border p-2">
          {sorted.map((file) => {
            const isSelected = selectedPath === file.path
            return (
              <li key={file.path}>
                <div
                  className={cn(
                    'group flex items-center gap-1 rounded-md px-2 py-1.5',
                    isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    onClick={() => onSelect(file.path)}
                  >
                    <File className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-xs">{file.path}</span>
                    {file.required && (
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {t('skills.required')}
                      </span>
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7', listActionTriggerClassName)}
                    onClick={() => onRename(file.path)}
                    aria-label={t('skills.renameFile')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7 text-destructive', listActionTriggerClassName)}
                    onClick={() => onDelete(file.path)}
                    aria-label={t('skills.deleteFile')}
                    disabled={file.path === 'SKILL.md'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
