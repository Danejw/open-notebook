import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { embeddingApi } from '@/lib/api/embedding'
import type {
  RebuildEmbeddingsRequest,
  RebuildStatusResponse,
} from '@/lib/api/embedding'

const DIMENSION_HEALTH_KEY = ['embeddings', 'dimension-health'] as const

export function useEmbeddingDimensionHealth() {
  return useQuery({
    queryKey: DIMENSION_HEALTH_KEY,
    queryFn: () => embeddingApi.getDimensionHealth(),
    refetchOnWindowFocus: true,
  })
}

export function useRebuildEmbeddingsStatus(commandId: string | null) {
  return useQuery({
    queryKey: ['embeddings', 'rebuild-status', commandId] as const,
    queryFn: () => embeddingApi.getRebuildStatus(commandId!),
    enabled: !!commandId,
    refetchInterval: (query) => {
      const data = query.state.data as RebuildStatusResponse | undefined
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false
      }
      return 5000
    },
    staleTime: 0,
  })
}

export function useRebuildEmbeddings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: RebuildEmbeddingsRequest) =>
      embeddingApi.rebuildEmbeddings(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DIMENSION_HEALTH_KEY })
    },
  })
}
