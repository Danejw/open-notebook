'use client'

import { useState, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { useDefaultPrompt, useUpdateDefaultPrompt } from '@/lib/hooks/use-artifacts'
import { useTranslation } from '@/lib/hooks/use-translation'

export function DefaultPromptEditor() {
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const { data: defaultPrompt, isLoading } = useDefaultPrompt()
  const updateDefaultPrompt = useUpdateDefaultPrompt()
  const { t } = useTranslation()
  const textareaId = useId()

  useEffect(() => {
    if (defaultPrompt) {
      setPrompt(defaultPrompt.artifact_instructions || '')
    }
  }, [defaultPrompt])

  const handleSave = () => {
    updateDefaultPrompt.mutate({ artifact_instructions: prompt })
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="overflow-hidden rounded-md border">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
          <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none">{t('artifacts.defaultPrompt')}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {t('artifacts.defaultPromptDesc')}
            </p>
          </div>
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-2 border-t px-3 py-2">
            <Label htmlFor={textareaId} className="sr-only">
              {t('artifacts.defaultPrompt')}
            </Label>
            <Textarea
              id={textareaId}
              name="default-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('artifacts.defaultPromptPlaceholder')}
              className="min-h-[120px] font-mono text-xs"
              disabled={isLoading}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSave}
                disabled={isLoading || updateDefaultPrompt.isPending}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
