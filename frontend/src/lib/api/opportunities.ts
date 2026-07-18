import apiClient from './client'
import type {
  Opportunity,
  OpportunityDashboard,
  OpportunityFilters,
  OpportunityListResponse,
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

  setStatus: async (id: string, status: OpportunityStatus) => {
    const response = await apiClient.post<Opportunity>(`/opportunities/${id}/status`, {
      status,
    })
    return response.data
  },

  pursue: async (id: string) => {
    const response = await apiClient.post<PursueOpportunityResponse>(
      `/opportunities/${id}/pursue`
    )
    return response.data
  },

  archive: async (id: string) => {
    const response = await apiClient.delete<{ message: string }>(`/opportunities/${id}`)
    return response.data
  },
}
