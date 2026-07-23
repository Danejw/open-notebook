import apiClient from '@/lib/api/client'
import { SearchRequest, SearchResponse } from '@/lib/types/search'

export const searchApi = {
  search: async (params: SearchRequest) => {
    const response = await apiClient.post<SearchResponse>('/search', params)
    return response.data
  },
}
