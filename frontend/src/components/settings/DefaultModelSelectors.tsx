'use client'

import { useState, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Wand2 } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useUpdateModelDefaults, useAutoAssignDefaults } from '@/lib/hooks/use-models'
import { Model, ModelDefaults } from '@/lib/types/models'
import { ModelPickerField } from '@/components/common/ModelPickerField'
import { EmbeddingModelChangeDialog } from '@/components/settings/EmbeddingModelChangeDialog'
import { ModelType } from '@/components/settings/apiKeysShared'

export interface DefaultModelSelectorsProps {
  models: Model[]
  defaults: ModelDefaults
}

export function DefaultModelSelectors({
  models,
  defaults,
}: DefaultModelSelectorsProps) {
  const { t } = useTranslation()
  const updateDefaults = useUpdateModelDefaults()
  const autoAssign = useAutoAssignDefaults()
  const { setValue, watch } = useForm<ModelDefaults>({ defaultValues: defaults })
  const generatedId = useId()

  const [showEmbeddingDialog, setShowEmbeddingDialog] = useState(false)
  const [pendingEmbeddingChange, setPendingEmbeddingChange] = useState<{
    key: keyof ModelDefaults; value: string; oldModelId?: string; newModelId?: string
  } | null>(null)

  useEffect(() => {
    if (defaults) {
      Object.entries(defaults).forEach(([key, value]) => {
        setValue(key as keyof ModelDefaults, value)
      })
    }
  }, [defaults, setValue])

  interface DefaultConfig {
    key: keyof ModelDefaults
    label: string
    description: string
    modelType: ModelType
    required?: boolean
    id: string
  }

  const primaryConfigs: DefaultConfig[] = [
    { key: 'default_chat_model', label: t('models.chatModelLabel'), description: t('models.chatModelDesc'), modelType: 'language', required: true, id: `${generatedId}-chat` },
    { key: 'default_embedding_model', label: t('models.embeddingModelLabel'), description: t('models.embeddingModelDesc'), modelType: 'embedding', required: true, id: `${generatedId}-embed` },
    { key: 'default_text_to_speech_model', label: t('models.ttsModelLabel'), description: t('models.ttsModelDesc'), modelType: 'text_to_speech', id: `${generatedId}-tts` },
    { key: 'default_speech_to_text_model', label: t('models.sttModelLabel'), description: t('models.sttModelDesc'), modelType: 'speech_to_text', id: `${generatedId}-stt` },
  ]

  const advancedConfigs: DefaultConfig[] = [
    { key: 'default_artifact_model', label: t('models.artifactModelLabel'), description: t('models.artifactModelDesc'), modelType: 'language', required: true, id: `${generatedId}-transform` },
    { key: 'default_tools_model', label: t('models.toolsModelLabel'), description: t('models.toolsModelDesc'), modelType: 'language', id: `${generatedId}-tools` },
    { key: 'large_context_model', label: t('models.largeContextModelLabel'), description: t('models.largeContextModelDesc'), modelType: 'language', id: `${generatedId}-large` },
  ]

  const defaultConfigs = [...primaryConfigs, ...advancedConfigs]

  const handleChange = (key: keyof ModelDefaults, value: string) => {
    if (key === 'default_embedding_model') {
      const current = defaults[key]
      if (current && current !== value) {
        setPendingEmbeddingChange({ key, value, oldModelId: current, newModelId: value })
        setShowEmbeddingDialog(true)
        return
      }
    }
    updateDefaults.mutate({ [key]: value || null })
  }

  const handleConfirmEmbeddingChange = () => {
    if (pendingEmbeddingChange) {
      updateDefaults.mutate({ [pendingEmbeddingChange.key]: pendingEmbeddingChange.value || null })
      setPendingEmbeddingChange(null)
    }
  }

  const getModelsForType = (type: ModelType) => models.filter(m => m.type === type)

  const missingRequired = defaultConfigs
    .filter(c => {
      if (!c.required) return false
      const value = defaults[c.key]
      if (!value) return true
      return !models.filter(m => m.type === c.modelType).some(m => m.id === value)
    })
    .map(c => c.label)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('models.defaultAssignments')}</CardTitle>
        <CardDescription>{t('models.defaultAssignmentsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {missingRequired.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{t('models.missingRequiredModels').replace('{models}', missingRequired.join(', '))}</span>
              <Button
                variant="outline" size="sm"
                onClick={() => autoAssign.mutate()}
                disabled={autoAssign.isPending}
                className="shrink-0 gap-1.5"
              >
                {autoAssign.isPending ? <InlineSkeleton className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
                {autoAssign.isPending ? t('models.autoAssigning') : t('models.autoAssign')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {primaryConfigs.map(config => {
            const available = getModelsForType(config.modelType)
            const currentValue = watch(config.key) || ''
            const isValid = currentValue && available.some(m => m.id === currentValue)

            return (
              <ModelPickerField
                key={config.key}
                id={config.id}
                label={config.label}
                labelClassName="text-xs"
                modelType={config.modelType}
                models={models}
                value={currentValue || null}
                onChange={(v) => handleChange(config.key, v ?? '')}
                size="compact"
                required={config.required}
                invalid={Boolean(config.required && !isValid && available.length > 0)}
                allowClear={!config.required}
                sortByName
                placeholder={
                  config.required && !isValid && available.length > 0
                    ? t('models.requiredModelPlaceholder')
                    : t('models.selectModelPlaceholder')
                }
              />
            )
          })}
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-3">{t('navigation.advanced')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {advancedConfigs.map(config => {
                const available = getModelsForType(config.modelType)
                const currentValue = watch(config.key) || ''
                const isValid = currentValue && available.some(m => m.id === currentValue)

                return (
                  <ModelPickerField
                    key={config.key}
                    id={config.id}
                    label={config.label}
                    labelClassName="text-xs"
                    modelType={config.modelType}
                    models={models}
                    value={currentValue || null}
                    onChange={(v) => handleChange(config.key, v ?? '')}
                    size="compact"
                    required={config.required}
                    invalid={Boolean(config.required && !isValid && available.length > 0)}
                    allowClear={!config.required}
                    sortByName
                    description={config.description}
                    placeholder={
                      config.required && !isValid && available.length > 0
                        ? t('models.requiredModelPlaceholder')
                        : t('models.selectModelPlaceholder')
                    }
                  />
                )
              })}
            </div>
        </div>
      </CardContent>

      <EmbeddingModelChangeDialog
        open={showEmbeddingDialog}
        onOpenChange={(open) => { if (!open) { setPendingEmbeddingChange(null); setShowEmbeddingDialog(false) } }}
        onConfirm={handleConfirmEmbeddingChange}
        oldModelName={pendingEmbeddingChange?.oldModelId ? models.find(m => m.id === pendingEmbeddingChange.oldModelId)?.name : undefined}
        newModelName={pendingEmbeddingChange?.newModelId ? models.find(m => m.id === pendingEmbeddingChange.newModelId)?.name : undefined}
      />
    </Card>
  )
}
