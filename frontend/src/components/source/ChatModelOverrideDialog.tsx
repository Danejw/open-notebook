'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { ModelSelector } from '@/components/common/ModelSelector'
import { Settings2 } from 'lucide-react'
import { useModelDefaults, useModels } from '@/lib/hooks/use-models'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ChatModelOverrideDialogProps {
  currentModel?: string
  onModelChange: (model?: string) => void
  disabled?: boolean
}

export function ChatModelOverrideDialog({
  currentModel,
  onModelChange,
  disabled = false,
}: ChatModelOverrideDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState(currentModel || 'default')
  const { data: models } = useModels()
  const { data: defaults } = useModelDefaults()

  useEffect(() => {
    setSelectedModel(currentModel || 'default')
  }, [currentModel])

  const languageModels = useMemo(() => {
    if (!models) {
      return []
    }
    return [...models]
      .filter((model) => model.type === 'language')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [models])

  const defaultModel = useMemo(() => {
    if (!defaults?.default_chat_model) return undefined
    return languageModels.find((model) => model.id === defaults.default_chat_model)
  }, [defaults?.default_chat_model, languageModels])

  const currentModelName = useMemo(() => {
    if (currentModel) {
      return languageModels.find((model) => model.id === currentModel)?.name || currentModel
    }
    if (defaultModel) {
      return defaultModel.name
    }
    return t('common.default')
  }, [currentModel, languageModels, defaultModel, t])

  const handleSave = () => {
    onModelChange(selectedModel === 'default' ? undefined : selectedModel)
    setOpen(false)
  }

  const handleReset = () => {
    setSelectedModel('default')
    onModelChange(undefined)
    setOpen(false)
  }

  return (
    <FormDialogShell
      open={open}
      onOpenChange={setOpen}
      title={t('common.modelConfiguration')}
      contentClassName="sm:max-w-md"
      submitLabel={t('common.saveChanges')}
      onOpen={() => setSelectedModel(currentModel || 'default')}
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="my-0 h-9 max-w-[140px] gap-1.5 px-2 shrink-0"
        >
          <Settings2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-xs">{currentModelName}</span>
        </Button>
      }
      footerLeft={
        <Button type="button" variant="outline" onClick={handleReset}>
          {t('common.resetToDefault')}
        </Button>
      }
    >
      <ModelSelector
        id="model"
        label={t('common.model')}
        modelType="language"
        value={selectedModel}
        onChange={setSelectedModel}
        sortByName
        placeholder={t('models.selectModelPlaceholder')}
        defaultOption={{
          value: 'default',
          label: defaultModel
            ? `${t('common.default')} (${defaultModel.name})`
            : t('artifacts.systemDefault'),
          provider: defaultModel?.provider,
        }}
      />
      {selectedModel && selectedModel !== 'default' ? (
        <div className="rounded-lg bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            {t('artifacts.sessionUseReplacement').replace(
              '{name}',
              languageModels.find((m) => m.id === selectedModel)?.name || selectedModel
            )}
          </p>
        </div>
      ) : null}
    </FormDialogShell>
  )
}
