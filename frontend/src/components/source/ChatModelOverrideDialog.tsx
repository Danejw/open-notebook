'use client'

import { useMemo } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResourcePicker } from '@/components/common/ResourcePicker'
import { useModelDefaults, useModels } from '@/lib/hooks/use-models'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { Model } from '@/lib/types/models'

interface ChatModelOverrideDialogProps {
  currentModel?: string
  onModelChange: (model?: string) => void
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** When false, dialog is opened externally (no visible trigger). */
  showTrigger?: boolean
}

type ModelPickerItem = Model | { id: 'default'; name: string; provider?: string }

export function ChatModelOverrideDialog({
  currentModel,
  onModelChange,
  disabled = false,
  open,
  onOpenChange,
  showTrigger = true,
}: ChatModelOverrideDialogProps) {
  const { t } = useTranslation()
  const { data: models, isLoading } = useModels()
  const { data: defaults } = useModelDefaults()

  const languageModels = useMemo(() => {
    if (!models) return []
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

  const items: ModelPickerItem[] = useMemo(() => {
    const defaultLabel = defaultModel
      ? `${t('common.default')} (${defaultModel.name})`
      : t('artifacts.systemDefault')
    return [
      { id: 'default', name: defaultLabel, provider: defaultModel?.provider },
      ...languageModels,
    ]
  }, [defaultModel, languageModels, t])

  const value = currentModel ?? 'default'

  return (
    <ResourcePicker
      selectionMode="single"
      value={value}
      onChange={(id) => {
        onModelChange(!id || id === 'default' ? undefined : id)
      }}
      open={open}
      onOpenChange={onOpenChange}
      title={t('common.modelConfiguration')}
      items={items}
      getItemId={(item) => item.id}
      getItemProps={(item) => ({
        title: item.name,
        description: 'provider' in item ? item.provider : undefined,
      })}
      isLoading={isLoading}
      emptyTitle={t('common.noResults')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      clearLabel={t('common.resetToDefault')}
      clearValue="default"
      afterBody={({ draftSingle }) =>
        draftSingle && draftSingle !== 'default' ? (
          <div className="border-t px-3 py-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                {t('artifacts.sessionUseReplacement').replace(
                  '{name}',
                  languageModels.find((model) => model.id === draftSingle)?.name || draftSingle
                )}
              </p>
            </div>
          </div>
        ) : undefined
      }
      trigger={
        showTrigger ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="my-0 h-9 max-w-[140px] gap-1.5 px-2 shrink-0"
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-xs">{currentModelName}</span>
          </Button>
        ) : undefined
      }
    />
  )
}
