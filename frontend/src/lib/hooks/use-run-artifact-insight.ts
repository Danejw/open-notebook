import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { insightsApi } from '@/lib/api/insights'
import { useTranslation } from '@/lib/hooks/use-translation'

interface RunArtifactOnSourceParams {
  sourceId: string
  artifactId: string
}

export function useRunArtifactInsight() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [isRunning, setIsRunning] = useState(false)

  const runArtifactOnSource = useCallback(
    async ({ sourceId, artifactId }: RunArtifactOnSourceParams) => {
      if (isRunning) return

      try {
        setIsRunning(true)
        const response = await insightsApi.create(sourceId, {
          artifact_id: artifactId,
        })

        toast.success(t('sources.artifactInsightQueued'))

        if (response.command_id) {
          void insightsApi
            .waitForCommand(response.command_id, {
              maxAttempts: 120,
              intervalMs: 2000,
            })
            .then((success) => {
              if (success) {
                queryClient.invalidateQueries({ queryKey: ['sources'] })
                queryClient.invalidateQueries({ queryKey: ['insights'] })
              }
            })
            .catch((err) => {
              console.error('Error waiting for insight command:', err)
            })
        } else {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['sources'] })
            queryClient.invalidateQueries({ queryKey: ['insights'] })
          }, 3000)
        }
      } catch (error) {
        console.error('Failed to run artifact on source:', error)
        toast.error(t('common.error'))
      } finally {
        setIsRunning(false)
      }
    },
    [isRunning, queryClient, t]
  )

  return { runArtifactOnSource, isRunning }
}
