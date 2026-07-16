'use client'

import { useState } from 'react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Key,
  AlertTriangle,
  Edit,
  Trash2,
  Plug,
  Check,
  X,
  Bot,
} from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useDeleteModel, useTestModel } from '@/lib/hooks/use-models'
import { useCredential, useTestCredential } from '@/lib/hooks/use-credentials'
import { Credential } from '@/lib/api/credentials'
import { Model, ModelDefaults } from '@/lib/types/models'
import { CredentialFormDialog } from '@/components/settings/CredentialFormDialog'
import { DiscoverModelsDialog } from '@/components/settings/DiscoverModelsDialog'
import { DeleteCredentialDialog } from '@/components/settings/DeleteCredentialDialog'
import { ModelTestResultDialog } from '@/components/settings/ModelTestResultDialog'
import {
  ModelType,
  TYPE_ICONS,
  TYPE_COLORS,
  TYPE_COLOR_INACTIVE,
  TYPE_LABEL_KEYS,
} from '@/components/settings/apiKeysShared'

export interface CredentialItemProps {
  credential: Credential
  models: Model[]
  defaults: ModelDefaults | null
  allCredentials: Credential[]
}

export function CredentialItem({
  credential,
  models,
  defaults,
  allCredentials,
}: CredentialItemProps) {
  const { t } = useTranslation()
  const { testCredential, isPending: isTestPending, testResults } = useTestCredential()
  const { testModel, isPending: isModelTestPending, testingModelId, testResult: modelTestResult, testedModelName, clearResult: clearModelTestResult } = useTestModel()
  const deleteModel = useDeleteModel()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const { data: fullCredential } = useCredential(editOpen ? credential.id : '')

  const linkedModels = models.filter(m => m.credential === credential.id)
  const activeTypes = new Set(linkedModels.map(m => m.type))
  const testResult = testResults[credential.id]

  const testModelLabel = t('models.testModel')
  const deleteModelLabel = t('models.deleteModel')

  const defaultSlots: Record<string, string> = {}
  if (defaults) {
    const slotMap: Record<string, string | null | undefined> = {
      'Chat': defaults.default_chat_model,
      'Transform': defaults.default_artifact_model,
      'Tools': defaults.default_tools_model,
      'Large Ctx': defaults.large_context_model,
      'Embedding': defaults.default_embedding_model,
      'TTS': defaults.default_text_to_speech_model,
      'STT': defaults.default_speech_to_text_model,
    }
    for (const [slot, modelId] of Object.entries(slotMap)) {
      if (modelId) defaultSlots[modelId] = slot
    }
  }

  return (
    <>
      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{credential.name}</span>
            <div className="flex gap-1">
              {credential.modalities.map(mod => (
                <Badge
                  key={mod}
                  variant="secondary"
                  className={`text-[10px] gap-0.5 px-1 py-0 ${activeTypes.has(mod as ModelType) ? (TYPE_COLORS[mod as ModelType] || '') : TYPE_COLOR_INACTIVE}`}
                >
                  {TYPE_ICONS[mod as ModelType]}
                  <span className="hidden sm:inline">
                    {t(TYPE_LABEL_KEYS[mod as ModelType] || mod)}
                  </span>
                </Badge>
              ))}
            </div>
            {credential.has_api_key && (
              <Badge variant="outline" className="text-[10px]">
                <Key className="h-2.5 w-2.5 mr-0.5" />
                {t('apiKeys.hasKey')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {testResult && (
              testResult.success
                ? <Check className="h-4 w-4 text-emerald-500" />
                : <X className="h-4 w-4 text-destructive" />
            )}
            <Button
              variant="ghost" size="sm"
              onClick={() => testCredential(credential.id)}
              disabled={isTestPending || !!credential.decryption_error}
              title={t('apiKeys.testConnection')}
              aria-label={t('apiKeys.testConnection')}
            >
              {isTestPending ? <InlineSkeleton /> : <Plug className="h-4 w-4" />}
              <span className="hidden sm:inline text-xs">{t('apiKeys.testButton')}</span>
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setDiscoverOpen(true)}
              disabled={!!credential.decryption_error}
              title={t('apiKeys.syncModels')}
              aria-label={t('apiKeys.syncModels')}
            >
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">{t('apiKeys.modelsButton')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={!!credential.decryption_error}
              title={t('common.edit')}
              aria-label={t('common.edit')}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              title={t('common.delete')}
              aria-label={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {credential.decryption_error && (
          <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">{t('apiKeys.decryptionError')}</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
              {t('apiKeys.decryptionErrorDescription')}
            </AlertDescription>
          </Alert>
        )}

        {linkedModels.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {(['language', 'embedding', 'text_to_speech', 'speech_to_text'] as ModelType[])
              .filter(type => linkedModels.some(m => m.type === type))
              .map(type => (
                <div key={type} className="flex items-start gap-1.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-0.5 px-1 py-0 shrink-0 mt-0.5 ${TYPE_COLORS[type]}`}
                  >
                    {TYPE_ICONS[type]}
                    {t(TYPE_LABEL_KEYS[type])}
                  </Badge>
                  <div className="flex flex-wrap gap-1">
                    {linkedModels.filter(m => m.type === type).map(model => {
                      const defaultSlot = defaultSlots[model.id]
                      return (
                        <Badge
                          key={model.id}
                          variant={defaultSlot ? 'default' : 'secondary'}
                          className="text-xs gap-1 pr-0.5 group/model"
                        >
                          {model.name}
                          {defaultSlot && <span className="ml-0.5 opacity-75">({defaultSlot})</span>}
                          <button
                            className="ml-0.5 opacity-0 group-hover/model:opacity-60 hover:!opacity-100 transition-opacity"
                            onClick={() => testModel(model.id, model.name)}
                            disabled={isModelTestPending && testingModelId === model.id}
                            title={testModelLabel}
                            aria-label={testModelLabel}
                          >
                            {isModelTestPending && testingModelId === model.id
                              ? <InlineSkeleton className="h-3 w-3" />
                              : <Plug className="h-3 w-3" />
                            }
                          </button>
                          <button
                            className="opacity-0 group-hover/model:opacity-60 hover:!opacity-100 hover:text-destructive transition-opacity"
                            onClick={() => deleteModel.mutate(model.id)}
                            title={deleteModelLabel}
                            aria-label={deleteModelLabel}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {editOpen && (
        <CredentialFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          provider={credential.provider}
          credential={fullCredential || credential}
        />
      )}

      {deleteOpen && (
        <DeleteCredentialDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          credential={credential}
          allCredentials={allCredentials}
        />
      )}

      {discoverOpen && (
        <DiscoverModelsDialog
          open={discoverOpen}
          onOpenChange={setDiscoverOpen}
          credential={credential}
        />
      )}

      <ModelTestResultDialog
        open={modelTestResult !== null}
        onOpenChange={(open) => { if (!open) clearModelTestResult() }}
        result={modelTestResult}
        modelName={testedModelName}
      />
    </>
  )
}
