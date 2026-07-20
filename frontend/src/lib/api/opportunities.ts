import apiClient from './client'
import type {
  Opportunity,
  OpportunityChange,
  OpportunityDashboard,
  OpportunityFilters,
  OpportunityListResponse,
  OpportunityMonitoringHealthSummary,
  OpportunityNaicsCollection,
  OpportunityRefreshResponse,
  OpportunityScoringProfile,
  OpportunityScoringProfileUpdate,
  OpportunitySource,
  OpportunityStatus,
  PursueOpportunityResponse,
} from '@/lib/types/opportunities'

function cleanFilters(filters: OpportunityFilters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '' && value !== 'all')
  )
}

export interface OpportunitySyncResult {
  source_key: string
  fetched: number
  total_records: number
  created: number
  updated: number
  failed: number
  posted_from: string
  posted_to: string
  collection_id?: string
  filter_strings?: string[]
}

async function watchOpportunity(id: string) {
  const response = await apiClient.post<OpportunityRefreshResponse>(`/opportunities/${id}/watch`)
  return response.data
}

async function unwatchOpportunity(id: string) {
  const response = await apiClient.post<Opportunity>(`/opportunities/${id}/unwatch`)
  return response.data
}

async function postStatus(id: string, status: OpportunityStatus) {
  const response = await apiClient.post<Opportunity>(`/opportunities/${id}/status`, {
    status,
  })
  return response.data
}

const TERMINAL_STATUSES: OpportunityStatus[] = ['won', 'lost', 'no_bid', 'ignored']

export const opportunitiesApi = {
  list: async (filters: OpportunityFilters = {}) => {
    const response = await apiClient.get<OpportunityListResponse>('/opportunities', {
      params: cleanFilters(filters),
    })
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<Opportunity>(`/opportunities/${id}`)
    return response.data
  },

  dashboard: async () => {
    const response = await apiClient.get<OpportunityDashboard>('/opportunities/dashboard')
    return response.data
  },

  getScoringProfile: async () => {
    const response = await apiClient.get<OpportunityScoringProfile>(
      '/opportunities/scoring-profile'
    )
    return response.data
  },

  updateScoringProfile: async (data: OpportunityScoringProfileUpdate) => {
    const response = await apiClient.put<OpportunityScoringProfile>(
      '/opportunities/scoring-profile',
      data
    )
    return response.data
  },

  sources: async () => {
    const response = await apiClient.get<OpportunitySource[]>('/opportunity-sources', {
      params: { enabled: true },
    })
    return response.data
  },

  seedSources: async () => {
    const response = await apiClient.post<OpportunitySource[]>('/opportunity-sources/seed')
    return response.data
  },

  naicsCollections: async () => {
    const response = await apiClient.get<OpportunityNaicsCollection[]>(
      '/opportunities/naics-collections'
    )
    return response.data
  },

  syncSamGov: async (daysBack = 14, collectionId?: string | null) => {
    const params: { days_back: number; collection_id?: string } = {
      days_back: daysBack,
    }
    // undefined = omit (reuse saved); null/'' = clear preference; string = save + use
    if (collectionId !== undefined) {
      params.collection_id = collectionId ?? ''
    }
    const response = await apiClient.post<OpportunitySyncResult>(
      '/opportunity-sources/sam_gov_hawaii/sync',
      undefined,
      { params }
    )
    return response.data
  },

  setSamSyncCollection: async (collectionId: string | null) => {
    const response = await apiClient.put<OpportunitySource>(
      '/opportunity-sources/sam_gov_hawaii/sync-collection',
      { collection_id: collectionId }
    )
    return response.data
  },

  watch: watchOpportunity,
  unwatch: unwatchOpportunity,

  checkNow: async (id: string) => {
    const response = await apiClient.post<OpportunityRefreshResponse>(
      `/opportunities/${id}/check-now`
    )
    return response.data
  },

  changes: async (id: string, limit = 50) => {
    const response = await apiClient.get<OpportunityChange[]>(`/opportunities/${id}/changes`, {
      params: { limit },
    })
    return response.data
  },

  acknowledgeChanges: async (id: string) => {
    const response = await apiClient.post<Opportunity>(
      `/opportunities/${id}/changes/acknowledge`
    )
    return response.data
  },

  monitoringHealth: async () => {
    const response = await apiClient.get<OpportunityMonitoringHealthSummary>(
      '/opportunities/monitoring/health'
    )
    return response.data
  },

  setStatus: async (id: string, status: OpportunityStatus) => {
    if (status === 'watching') {
      const result = await watchOpportunity(id)
      return result.opportunity
    }
    if (status === 'none') {
      await postStatus(id, status)
      return unwatchOpportunity(id)
    }

    const opportunity = await postStatus(id, status)
    if (TERMINAL_STATUSES.includes(status)) {
      return unwatchOpportunity(id)
    }
    return opportunity
  },

  pursue: async (id: string) => {
    const response = await apiClient.post<PursueOpportunityResponse>(
      `/opportunities/${id}/pursue`
    )
    try {
      const watchResult = await watchOpportunity(id)
      return { ...response.data, opportunity: watchResult.opportunity }
    } catch {
      // Pursuit succeeds independently when the source does not support monitoring.
      // If activation reached the backend, its durable health state remains on the record.
      return response.data
    }
  },

  archive: async (id: string) => {
    await unwatchOpportunity(id)
    const response = await apiClient.delete<{ message: string }>(`/opportunities/${id}`)
    return response.data
  },
}
