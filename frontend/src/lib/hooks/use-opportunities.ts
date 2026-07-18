import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  opportunitiesApi,
  type OpportunitySyncRequest,
} from '@/lib/api/opportunities'
import type { OpportunityFilters, OpportunityStatus } from '@/lib/types/opportunities'
import { useToast } from '@/lib/hooks/use-toast'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'

const OPPORTUNITIES_KEY = ['opportunities'] as const
const OPPORTUNITY_SOURCES_KEY = ['opportunity-sources'] as const
const OPPORTUNITY_NAICS_COLLECTIONS_KEY = ['opportunity-naics-collections'] as const
const OPPORTUNITY_CHANGES_KEY = ['opportunity-changes'] as const

export function useOpportunities(filters: OpportunityFilters) {
  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, filters],
    queryFn: () => opportunitiesApi.list(filters),
    placeholderData: (previousData) => previousData,
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

export function useOpportunitySources() {
  return useQuery({
    queryKey: OPPORTUNITY_SOURCES_KEY,
    queryFn: opportunitiesApi.sources,
  })
}

export function useOpportunityNaicsCollections() {
  return useQuery({
    queryKey: OPPORTUNITY_NAICS_COLLECTIONS_KEY,
    queryFn: opportunitiesApi.naicsCollections,
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

export function useSeedOpportunitySources() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: opportunitiesApi.seedSources,
    onSuccess: (sources) => {
      queryClient.setQueryData(OPPORTUNITY_SOURCES_KEY, sources)
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_NAICS_COLLECTIONS_KEY })
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
    mutationFn: (request: OpportunitySyncRequest = {}) =>
      opportunitiesApi.syncSamGov(request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_SOURCES_KEY })
      toast({
        title: 'Federal opportunities synchronized',
        description: `${result.created} new · ${result.updated} refreshed · ${result.failed} failed · ${result.collection_name}`,
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
    onSuccess: (opportunity, variables) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({
        queryKey: [...OPPORTUNITY_CHANGES_KEY, opportunity.id],
      })
      if (variables.status === 'watching') {
        toast({
          title: 'Opportunity is being watched',
          description: opportunity.monitoring_last_error
            ? `Monitoring is active, but the first check needs attention: ${opportunity.monitoring_last_error}`
            : 'The current notice was checked and future updates will be detected automatically.',
          variant: opportunity.monitoring_last_error ? 'destructive' : 'default',
        })
      }
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
        title: result.changed ? 'Opportunity updated' : 'Opportunity is current',
        description: result.change?.summary ?? 'No meaningful source changes were detected.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Opportunity check failed',
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

  return useMutation({
    mutationFn: (id: string) => opportunitiesApi.pursue(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITIES_KEY })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: result.project_created ? 'Bid workspace created' : 'Bid workspace opened',
        description: `${result.project_name} · monitoring enabled`,
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
