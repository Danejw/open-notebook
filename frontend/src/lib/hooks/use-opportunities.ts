import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { opportunitiesApi } from '@/lib/api/opportunities'
import type { OpportunityFilters, OpportunityStatus } from '@/lib/types/opportunities'
import { useToast } from '@/lib/hooks/use-toast'

const OPPORTUNITIES_KEY = ['opportunities'] as const
const OPPORTUNITY_SOURCES_KEY = ['opportunity-sources'] as const

export function useOpportunities(filters: OpportunityFilters) {
  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, filters],
    queryFn: () => opportunitiesApi.list(filters),
    placeholderData: (previousData) => previousData,
  })
}

export function useOpportunityDashboard() {
  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, 'dashboard'],
    queryFn: opportunitiesApi.dashboard,
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
