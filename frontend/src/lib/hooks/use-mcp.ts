import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mcpApi } from '@/lib/api/mcp'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import {
  CreateMcpConnectionRequest,
  UpdateMcpConnectionAuthRequest,
} from '@/lib/types/mcp'

export function useMcpConnections() {
  return useQuery({
    queryKey: QUERY_KEYS.mcpConnections,
    queryFn: () => mcpApi.listConnections(),
  })
}

export function useMcpConnection(id?: string, options?: { enabled?: boolean }) {
  const connectionId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.mcpConnection(connectionId),
    queryFn: () => mcpApi.getConnection(connectionId),
    enabled: !!connectionId && (options?.enabled ?? true),
  })
}

export function useMcpConnectionTools(connectionId?: string, options?: { enabled?: boolean }) {
  const id = connectionId ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.mcpConnectionTools(id),
    queryFn: () => mcpApi.listConnectionTools(id),
    enabled: !!id && (options?.enabled ?? true),
  })
}

export function useMcpSelectableTools(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.mcpSelectableTools,
    queryFn: () => mcpApi.listSelectableTools(),
    enabled: options?.enabled ?? true,
  })
}

export function useMcpSessionToolCalls(sessionId?: string | null) {
  const id = sessionId ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.mcpSessionToolCalls(id),
    queryFn: () => mcpApi.listSessionToolCalls(id),
    enabled: !!id,
    refetchOnWindowFocus: true,
  })
}

export function useCreateMcpConnection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateMcpConnectionRequest) => mcpApi.createConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpSelectableTools })
      toast({
        title: t('common.success'),
        description: t('tools.createSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteMcpConnection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => mcpApi.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpSelectableTools })
      toast({
        title: t('common.success'),
        description: t('tools.deleteSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateMcpConnectionAuth() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMcpConnectionAuthRequest }) =>
      mcpApi.updateAuth(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnection(id) })
      toast({
        title: t('common.success'),
        description: t('tools.authUpdateSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useTestMcpConnection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => mcpApi.testConnection(id),
    onSuccess: (connection) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnection(connection.id) })
      toast({
        title: t('common.success'),
        description:
          connection.status === 'connected'
            ? t('tools.testSuccess')
            : t('tools.testFailed'),
        variant: connection.status === 'connected' ? 'default' : 'destructive',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useSyncMcpConnection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => mcpApi.syncConnection(id),
    onSuccess: (connection) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnection(connection.id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpConnectionTools(connection.id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpSelectableTools })
      toast({
        title: t('common.success'),
        description: t('tools.syncSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}
