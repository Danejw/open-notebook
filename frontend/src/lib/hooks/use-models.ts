import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelsApi } from '@/lib/api/models'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import { ModelDefaults, ModelTestResult } from '@/lib/types/models'

export const MODEL_QUERY_KEYS = {
  models: ['models'] as const,
  defaults: ['models', 'defaults'] as const,
}

type ModelsQueryOptions = {
  enabled?: boolean
}

export function useModels(options?: ModelsQueryOptions) {
  return useQuery({
    queryKey: MODEL_QUERY_KEYS.models,
    queryFn: () => modelsApi.list(),
    enabled: options?.enabled ?? true,
  })
}

export function useModelDefaults(options?: ModelsQueryOptions) {
  return useQuery({
    queryKey: MODEL_QUERY_KEYS.defaults,
    queryFn: () => modelsApi.getDefaults(),
    enabled: options?.enabled ?? true,
  })
}

export function useUpdateModelDefaults() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: Partial<ModelDefaults>) => modelsApi.updateDefaults(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.defaults })
      toast({
        title: t('common.success'),
        description: t('models.saveSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('common.error')),
        variant: 'destructive',
      })
    },
  })
}

export function useAutoAssignDefaults() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: () => modelsApi.autoAssign(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.defaults })

      const assignedCount = Object.keys(result.assigned).length
      const missingCount = result.missing.length

      if (assignedCount > 0) {
        toast({
          title: t('common.success'),
          description: t('models.autoAssignSuccess').replace('{count}', assignedCount.toString()),
        })
      } else if (missingCount > 0) {
        toast({
          title: t('common.warning'),
          description: t('models.autoAssignNoModels'),
          variant: 'destructive',
        })
      } else {
        toast({
          title: t('common.success'),
          description: t('models.autoAssignAlreadySet'),
        })
      }
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('common.error')),
        variant: 'destructive',
      })
    },
  })
}

export function useTestModel() {
  const [testResult, setTestResult] = useState<ModelTestResult | null>(null)
  const [testedModelName, setTestedModelName] = useState('')
  const [testingModelId, setTestingModelId] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (modelId: string) => modelsApi.testModel(modelId),
    onSuccess: (result) => {
      setTestResult(result)
      setTestingModelId(null)
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error)
      setTestResult({ success: false, message: msg })
      setTestingModelId(null)
    },
  })

  const testModel = useCallback((modelId: string, modelName: string) => {
    setTestedModelName(modelName)
    setTestingModelId(modelId)
    setTestResult(null)
    mutation.mutate(modelId)
  }, [mutation])

  const clearResult = useCallback(() => {
    setTestResult(null)
    setTestedModelName('')
    setTestingModelId(null)
  }, [])

  return {
    testModel,
    isPending: mutation.isPending,
    testingModelId,
    testResult,
    testedModelName,
    clearResult,
  }
}
