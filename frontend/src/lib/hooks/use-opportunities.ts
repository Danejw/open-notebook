import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { opportunitiesApi } from '@/lib/api/opportunities'
import type {
  Opportunity,
  OpportunityFilters,
  OpportunityListResponse,
  OpportunityScoringProfileUpdate,
  OpportunityStatus,
} from '@/lib/types/opportunities'
import { useToast } from '@/lib/hooks/use-toast'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'

const OPPORTUNITIES_KEY = ['opportunities'] as const
const OPPORTUNITY_SOURCES_KEY = ['opportunity-sources'] as const
const OPPORTUNITY_CHANGES_KEY = ['opportunity-changes'] as const
const SCORING_PROFILE_KEY = ['opportunities', 'scoring-profile'] as const

function isOpportunityListQueryKey(queryKey: readonly unknown[]): boolean {
  return (
    queryKey.length === 2 &&
    queryKey[0] === OPPORTUNITIES_KEY[0] &&
    typeof queryKey[1] === 'object' &&
    queryKey[1] !== null
  )
}

/** Keep list rows aligned with detail GET, which may rescore on description backfill. */
function syncOpportunityInListCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: Opportunity
): void {
  queryClient.setQueriesData<OpportunityListResponse>(
    {
      queryKey: OPPORTUNITIES_KEY,
      predicate: (query) => isOpportunityListQueryKey(query.queryKey),
    },
    (cached) => {
      if (!cached?.items.some((item) => item.id === updated.id)) {
        return cached
      }
      return {
        ...cached,
        items: cached.items.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        ),
      }
    }
  )
}

export function useOpportunities(filters: OpportunityFilters) {
  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, filters],
    queryFn: () => opportunitiesApi.list(filters),
    placeholderData: (previousData) => previousData,
    refetchInterval: 60_000,
  })
}

export function useOpportunity(opportunityId: string | null) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, 'detail', opportunityId],
    queryFn: async () => {
      const opportunity = await opportunitiesApi.get(opportunityId as string)
      syncOpportunityInListCaches(queryClient, opportunity)
      return opportunity
    },
    enabled: Boolean(opportunityId),
    refetchInterval: 60_000,
  })
}

export function useOpportunityDashboard() {
  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, 'dashboard'],
    queryFn: opportunitiesApi.dashboard,
    refetchInterval: 60_000,
  })
}

export function useOpportunityChanges(opportunityId: string | null) {
  return useQuery({
    queryKey: [...OPPORTUNITY_CHANGES_KEY, opportunityId],
    queryFn: () => opportunitiesApi.changes(opportunityId ?? ''),
    enabled: Boolean(opportunityId),
    refetchInterval: 60_000,
  })
}

export function useOpportunityScoringProfile() {
  return useQuery({
    queryKey: SCORING_PROFILE_KEY,
    queryFn: opportunitiesApi.getScoringProfile,
  })
}

export function useUpdateOpportunityScoringProfile() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: OpportunityScoringProfileUpdate) =>
      opportunitiesApi.updateScoringProfile(data),
    onSuccess: (result) => {
      queryClient.setQueryData(SCORING_PROFILE_KEY, result)
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      const rescored = result.rescored ?? 0
      toast({
        title: t('companyProfile.saveSuccessTitle'),
        description: t('companyProfile.saveSuccessDescription', { count: rescored }),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('companyProfile.saveErrorTitle'),
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}

export function useOpportunitySources() {
  return useQuery({
    queryKey: OPPORTUNITY_SOURCES_KEY,
    queryFn: opportunitiesApi.sources,
  })
}

export function useSeedOpportunitySources() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: opportunitiesApi.seedSources,
    onSuccess: (sources) => {
      queryClient.setQueryData(OPPORTUNITY_SOURCES_KEY, sources)
    },
    onError: () => {
      toast({
        title: t('opportunities.toastSeedSourcesFailedTitle'),
        description: t('opportunities.toastSeedSourcesFailedDescription'),
        variant: 'destructive',
      })
    },
  })
}

export function useSyncSamGovOpportunities() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (input: number | { daysBack?: number; collectionId?: string | null } = 14) => {
      if (typeof input === 'number') {
        return opportunitiesApi.syncSamGov(input)
      }
      return opportunitiesApi.syncSamGov(input.daysBack ?? 14, input.collectionId ?? null)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_SOURCES_KEY })
      const filterNote =
        result.filter_strings && result.filter_strings.length > 0
          ? t('opportunities.toastSyncFilteredNote').replace(
              '{count}',
              String(result.filter_strings.length)
            )
          : ''
      toast({
        title: t('opportunities.toastSyncSuccessTitle'),
        description: t('opportunities.toastSyncSuccessDescription')
          .replace('{created}', String(result.created))
          .replace('{updated}', String(result.updated))
          .replace('{failed}', String(result.failed))
          .replace('{filterNote}', filterNote),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('opportunities.toastSyncFailedTitle'),
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}

export function useImportSamGovOpportunityUrl() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (url: string) => opportunitiesApi.importSamGovUrl(url),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({ queryKey: [...OPPORTUNITIES_KEY, 'dashboard'] })
      toast({
        title: result.created
          ? t('opportunities.toastImportAddedTitle')
          : t('opportunities.toastImportRefreshedTitle'),
        description: result.opportunity.title,
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('opportunities.toastImportFailedTitle'),
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}

export function useSetSamSyncCollection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (collectionId: string | null) =>
      opportunitiesApi.setSamSyncCollection(collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_SOURCES_KEY })
    },
    onError: (error: unknown) => {
      toast({
        title: t('opportunities.toastSyncCollectionSaveFailedTitle'),
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}

export function useSetOpportunityStatus() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OpportunityStatus }) =>
      opportunitiesApi.setStatus(id, status),
    onSuccess: (opportunity, variables) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({
        queryKey: [...OPPORTUNITY_CHANGES_KEY, opportunity.id],
      })
      if (variables.status === 'watching') {
        toast({
          title: t('opportunities.toastWatchingTitle'),
          description: opportunity.monitoring_last_error
            ? t('opportunities.toastWatchingDescriptionError').replace(
                '{error}',
                opportunity.monitoring_last_error
              )
            : t('opportunities.toastWatchingDescriptionOk'),
          variant: opportunity.monitoring_last_error ? 'destructive' : 'default',
        })
      }
    },
    onError: (error: unknown) => {
      toast({
        title: t('opportunities.toastStatusChangeFailedTitle'),
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}

export function useCheckOpportunityNow() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: opportunitiesApi.checkNow,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({
        queryKey: [...OPPORTUNITY_CHANGES_KEY, result.opportunity.id],
      })
      toast({
        title: result.changed
          ? t('opportunities.toastCheckUpdatedTitle')
          : t('opportunities.toastCheckCurrentTitle'),
        description:
          result.change?.summary ?? t('opportunities.toastCheckNoChangesDescription'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('opportunities.toastCheckFailedTitle'),
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}

export function useAcknowledgeOpportunityChanges() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: opportunitiesApi.acknowledgeChanges,
    onSuccess: (opportunity) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({
        queryKey: [...OPPORTUNITY_CHANGES_KEY, opportunity.id],
      })
    },
  })
}

export function usePursueOpportunity() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => opportunitiesApi.pursue(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: result.project_created
          ? t('opportunities.toastPursueCreatedTitle')
          : t('opportunities.toastPursueOpenedTitle'),
        description: result.opportunity.monitoring_enabled
          ? t('opportunities.toastPursueMonitoringEnabled').replace(
              '{projectName}',
              result.project_name
            )
          : t('opportunities.toastPursueMonitoringUnavailable').replace(
              '{projectName}',
              result.project_name
            ),
      })
    },
    onError: () => {
      toast({
        title: t('opportunities.toastPursueFailedTitle'),
        description: t('opportunities.toastPursueFailedDescription'),
        variant: 'destructive',
      })
    },
  })
}

export function useArchiveOpportunity() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: opportunitiesApi.archive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
    },
    onError: () => {
      toast({
        title: t('opportunities.toastArchiveFailedTitle'),
        variant: 'destructive',
      })
    },
  })
}
