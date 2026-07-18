import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { drawingExtractionApi } from '@/lib/api/drawing-extraction'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'

export const DRAWING_QUERY_KEYS = {
  sourceRuns: (sourceId: string) =>
    ['drawing-extractions', 'source', sourceId] as const,
  projectRuns: (projectId: string) =>
    ['drawing-extractions', 'project', projectId] as const,
  run: (runId: string) => ['drawing-extractions', 'run', runId] as const,
}

export function useProjectDrawingRuns(projectId: string | undefined) {
  return useQuery({
    queryKey: DRAWING_QUERY_KEYS.projectRuns(projectId ?? ''),
    queryFn: () => drawingExtractionApi.listProjectRuns(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? []
      const active = runs.some((r) =>
        ['queued', 'inspecting', 'extracting', 'validating', 'publishing'].includes(
          r.status
        )
      )
      return active ? 2500 : false
    },
  })
}

export function useSourceDrawingRuns(sourceId: string | undefined) {
  return useQuery({
    queryKey: DRAWING_QUERY_KEYS.sourceRuns(sourceId ?? ''),
    queryFn: () => drawingExtractionApi.listSourceRuns(sourceId!),
    enabled: Boolean(sourceId),
  })
}

export function useDrawingRun(runId: string | undefined) {
  return useQuery({
    queryKey: DRAWING_QUERY_KEYS.run(runId ?? ''),
    queryFn: () => drawingExtractionApi.getRun(runId!),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status
      if (
        status &&
        ['queued', 'inspecting', 'extracting', 'validating', 'publishing'].includes(
          status
        )
      ) {
        return 2000
      }
      return false
    },
  })
}

export function useExtractArchitecturalDrawings() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (payload: {
      source_ids: string[]
      project_id?: string
      force?: boolean
    }) => drawingExtractionApi.extract(payload),
    onSuccess: (data, variables) => {
      const ok = data.jobs.filter((j) => j.success).length
      const rejected = data.rejected.length
      if (ok > 0) {
        toast.success(
          t('sources.drawingExtractQueued').replace('{count}', String(ok))
        )
      }
      if (rejected > 0) {
        toast.error(
          t('sources.drawingExtractRejected').replace('{count}', String(rejected))
        )
      }
      if (variables.project_id) {
        queryClient.invalidateQueries({
          queryKey: DRAWING_QUERY_KEYS.projectRuns(variables.project_id),
        })
        queryClient.invalidateQueries({ queryKey: ['sources'] })
      }
      for (const job of data.jobs) {
        queryClient.invalidateQueries({
          queryKey: DRAWING_QUERY_KEYS.sourceRuns(job.source_id),
        })
        if (job.run_id) {
          queryClient.invalidateQueries({
            queryKey: DRAWING_QUERY_KEYS.run(job.run_id),
          })
        }
      }
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t, 'sources.drawingExtractFailed'))
    },
  })
}

export function useActivateDrawingRun(projectId?: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (runId: string) => drawingExtractionApi.activateRun(runId),
    onSuccess: (_data, runId) => {
      toast.success(t('sources.drawingRunActivated'))
      queryClient.invalidateQueries({ queryKey: DRAWING_QUERY_KEYS.run(runId) })
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: DRAWING_QUERY_KEYS.projectRuns(projectId),
        })
      }
    },
  })
}

export function useRetryDrawingRun(projectId?: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (runId: string) => drawingExtractionApi.retryRun(runId, true),
    onSuccess: (data) => {
      toast.success(t('sources.drawingExtractQueued').replace('{count}', '1'))
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: DRAWING_QUERY_KEYS.projectRuns(projectId),
        })
      }
      for (const job of data.jobs) {
        if (job.run_id) {
          queryClient.invalidateQueries({
            queryKey: DRAWING_QUERY_KEYS.run(job.run_id),
          })
        }
      }
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t, 'sources.drawingExtractFailed'))
    },
  })
}
