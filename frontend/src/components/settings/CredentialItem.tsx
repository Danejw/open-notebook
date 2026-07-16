'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ResourceList } from '@/components/common/ResourceList'
import { settleBulkActions } from '@/components/common/bulk-settle'
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
import { MODEL_QUERY_KEYS, useTestModel } from '@/lib/hooks/use-models'
import { useCredential, useTestCredential } from '@/lib/hooks/use-credentials'
import { modelsApi } from '@/lib/api/models'
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
  const queryClient = useQueryClient()
  const { testCredential, isPending: isTestPending, testResults } = useTestCredential()
  const { testModel, isPending: isModelTestPending, testingModelId, testResult: modelTestResult, testedModelName, clearResult: clearModelTestResult } = useTestModel()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const { data: fullCredential } = useCredential(editOpen ? credential.id : '')

  const linkedModels = models.filter(m => m.credential === credential.id)
  const activeTypes = new Set(linkedModels.map(m => m.type))
  const testResult = testResults[credential.id]

  const testModelLabel = t('models.testModel')

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
          <ResourceList
            className="mt-1"
            title={t('apiKeys.modelsButton')}
            items={linkedModels}
            getItemId={(model) => model.id}
            formatSelectedCount={(count) =>
              t('common.selectedItems').replace('{count}', count.toString())
            }
            bulkActions={({ selectedIds }) => (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-destructive hover:text-destructive"
                disabled={bulkBusy || selectedIds.length === 0}
                onClick={() => setBulkDeleteIds(selectedIds)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {t('common.bulkDelete')}
              </Button>
            )}
            renderItem={(model, ctx) => {
              const defaultSlot = defaultSlots[model.id]
              return (
                <div
                  className="flex items-center gap-2 px-3 py-1.5"
                  onClick={
                    ctx.selectionMode ? () => ctx.onToggle(!ctx.selected) : undefined
                  }
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-0.5 px-1 py-0 shrink-0 ${TYPE_COLORS[model.type as ModelType] || ''}`}
                  >
                    {TYPE_ICONS[model.type as ModelType]}
                    {t(TYPE_LABEL_KEYS[model.type as ModelType])}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {model.name}
                    {defaultSlot ? (
                      <span className="ml-1 text-xs text-muted-foreground">({defaultSlot})</span>
                    ) : null}
                  </span>
                  {!ctx.selectionMode ? (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => testModel(model.id, model.name)}
                      disabled={isModelTestPending && testingModelId === model.id}
                      title={testModelLabel}
                      aria-label={testModelLabel}
                    >
                      {isModelTestPending && testingModelId === model.id ? (
                        <InlineSkeleton className="h-3.5 w-3.5" />
                      ) : (
                        <Plug className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : null}
                </div>
              )
            }}
          />
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

      <ConfirmDialog
        open={Boolean(bulkDeleteIds?.length)}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteIds(null)
        }}
        title={t('models.deleteModel')}
        description={t('common.bulkDeleteConfirm').replace(
          '{count}',
          String(bulkDeleteIds?.length ?? 0)
        )}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => {
          void (async () => {
            if (!bulkDeleteIds?.length) return
            setBulkBusy(true)
            try {
              const { succeeded, failed } = await settleBulkActions(bulkDeleteIds, (id) =>
                modelsApi.delete(id)
              )
              if (failed > 0) {
                toast.error(t('common.bulkPartial').replace('{failed}', failed.toString()))
              }
              if (succeeded > 0) {
                toast.success(t('common.bulkSuccess').replace('{count}', succeeded.toString()))
              }
              await queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.models })
              await queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.defaults })
              setBulkDeleteIds(null)
            } finally {
              setBulkBusy(false)
            }
          })()
        }}
        isLoading={bulkBusy}
      />

      <ModelTestResultDialog
        open={modelTestResult !== null}
        onOpenChange={(open) => { if (!open) clearModelTestResult() }}
        result={modelTestResult}
        modelName={testedModelName}
      />
    </>
  )
}
