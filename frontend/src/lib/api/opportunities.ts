import apiClient from './client'
import type {
  Opportunity,
  OpportunityChange,
  OpportunityDashboard,
  OpportunityFilters,
  OpportunityListResponse,
  OpportunityNaicsCollection,
  OpportunityRefreshResponse,
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
  unique_fetched: number
  total_records: number
  created: number
  updated: number
  failed: number
  posted_from: string
  posted_to: string
  collection_id: string
  collection_name: string
  naics_codes: string[]
}

export interface OpportunitySyncRequest {
  daysBack?: number
  collectionId?: string
  limit?: number
}

const TERMINAL_STATUSES: OpportunityStatus[] = ['won', 'lost', 'no_bid', 'ignored']

async function watchOpportunity(id: string) {
  const response = await apiClient.post<OpportunityRefreshResponse>(
    `/opportunities/${id}/watch`
  )
  return response.data
}

async function unwatchOpportunity(id: string) {
  const response = await apiClient.post<Opportunity>(`/opportunities/${id}/unwatch`)
  return response.data
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

  syncSamGov: async ({
    daysBack = 14,
    collectionId,
    limit = 1000,
  }: OpportunitySyncRequest = {}) => {
    const response = await apiClient.post<OpportunitySyncResult>(
      '/opportunity-sources/sam_gov_hawaii/sync',
      undefined,
      {
        params: {
          days_back: daysBack,
          collection_id: collectionId || undefined,
          limit,
        },
      }
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

  setStatus: async (id: string, status: OpportunityStatus) => {
    if (status === 'watching') {
      const result = await watchOpportunity(id)
      return result.opportunity
    }

    const response = await apiClient.post<Opportunity>(`/opportunities/${id}/status`, {
      status,
    })
    if (TERMINAL_STATUSES.includes(status)) {
      return unwatchOpportunity(id)
    }
    return response.data
  },

  pursue: async (id: string) => {
    const response = await apiClient.post<PursueOpportunityResponse>(
      `/opportunities/${id}/pursue`
    )
    try {
      const watchResult = await watchOpportunity(id)
      return { ...response.data, opportunity: watchResult.opportunity }
    } catch {
      // Pursuit succeeds independently. The monitor remains visible as unhealthy
      // when activation reached the backend but the source refresh failed.
      return response.data
    }
  },

  archive: async (id: string) => {
    await unwatchOpportunity(id)
    const response = await apiClient.delete<{ message: string }>(`/opportunities/${id}`)
    return response.data
  },
}
