'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Loader2 } from 'lucide-react'
import { Transformation } from '@/lib/types/transformations'
import { useExecuteTransformation } from '@/lib/hooks/use-transformations'
import { ModelSelector } from '@/components/common/ModelSelector'
import { useTranslation } from '@/lib/hooks/use-translation'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'

interface TransformationPlaygroundProps {
  transformations: Transformation[] | undefined
  selectedTransformation?: Transformation
}

export function TransformationPlayground({ transformations, selectedTransformation }: TransformationPlaygroundProps) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState(selectedTransformation?.id || '')
  const [inputText, setInputText] = useState('')
  const [modelId, setModelId] = useState('')
  const [output, setOutput] = useState('')

  const executeTransformation = useExecuteTransformation()

  const handleExecute = async () => {
    if (!selectedId || !modelId || !inputText.trim()) {
      return
    }

    const result = await executeTransformation.mutateAsync({
      transformation_id: selectedId,
      input_text: inputText,
      model_id: modelId,
    })

    setOutput(result.output)
  }

  const canExecute = selectedId && modelId && inputText.trim() && !executeTransformation.isPending

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold leading-none">{t('transformations.playground')}</h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="transformation" className="text-xs">
              {t('navigation.transformation')}
            </Label>
            <Select name="transformation" value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id="transformation" className="h-8 text-xs">
                <SelectValue placeholder={t('transformations.selectToStart')} />
              </SelectTrigger>
              <SelectContent>
                {transformations?.map((transformation) => (
                  <SelectItem key={transformation.id} value={transformation.id}>
                    {transformation.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <ModelSelector
              label={t('transformations.model')}
              name="model"
              modelType="language"
              value={modelId}
              onChange={setModelId}
              placeholder={t('transformations.selectModel')}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="input" className="text-xs">
            {t('transformations.inputLabel')}
          </Label>
          <Textarea
            id="input"
            name="input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t('transformations.inputPlaceholder')}
            rows={6}
            className="min-h-[120px] font-mono text-xs"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleExecute} disabled={!canExecute} size="sm" className="h-7 text-xs">
            {executeTransformation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('transformations.running')}
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {t('transformations.runTest')}
              </>
            )}
          </Button>
        </div>

        {output ? (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium leading-none">{t('transformations.outputLabel')}</p>
            <div className="rounded-md border bg-muted/30 p-2">
              <MarkdownRenderer size="sm">{output}</MarkdownRenderer>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
