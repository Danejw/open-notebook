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
  })
}

export function useOpportunityDashboard() {
  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, 'dashboard'],
    queryFn: opportunitiesApi.dashboard,
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

  return useMutation({
    mutationFn: opportunitiesApi.seedSources,
    onSuccess: (sources) => {
      queryClient.setQueryData(OPPORTUNITY_SOURCES_KEY, sources)
    },
    onError: () => {
      toast({
        title: 'Source registry could not be initialized',
        description: 'The Opportunity Hub is available, but its Hawaii source list was not saved.',
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
    mutationFn: (daysBack: number = 14) => opportunitiesApi.syncSamGov(daysBack),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_SOURCES_KEY })
      toast({
        title: 'Federal opportunities synchronized',
        description: `${result.created} new · ${result.updated} refreshed · ${result.failed} failed`,
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'SAM.gov synchronization failed',
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}

export function useSetOpportunityStatus() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OpportunityStatus }) =>
      opportunitiesApi.setStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
    },
    onError: () => {
      toast({
        title: 'Status was not changed',
        description: 'Review the opportunity and try the action again.',
        variant: 'destructive',
      })
    },
  })
}

export function usePursueOpportunity() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (id: string) => opportunitiesApi.pursue(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: result.project_created ? 'Bid workspace created' : 'Bid workspace opened',
        description: result.project_name,
      })
    },
    onError: () => {
      toast({
        title: 'Bid workspace was not created',
        description: 'The opportunity is unchanged. Try again after checking the API connection.',
        variant: 'destructive',
      })
    },
  })
}

export function useArchiveOpportunity() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: opportunitiesApi.archive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
    },
    onError: () => {
      toast({
        title: 'Opportunity was not archived',
        variant: 'destructive',
      })
    },
  })
}
