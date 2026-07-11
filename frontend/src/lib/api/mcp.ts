import apiClient from '@/lib/api/client'
import {
  ChatToolCall,
  CreateMcpConnectionRequest,
  McpConnection,
  McpTool,
  UpdateMcpConnectionAuthRequest,
} from '@/lib/types/mcp'

export const mcpApi = {
  listConnections: async () => {
    const response = await apiClient.get<McpConnection[]>('/mcp/connections')
    return response.data
  },

  getConnection: async (id: string) => {
    const response = await apiClient.get<McpConnection>(`/mcp/connections/${id}`)
    return response.data
  },

  createConnection: async (data: CreateMcpConnectionRequest) => {
    const response = await apiClient.post<McpConnection>('/mcp/connections', data)
    return response.data
  },

  deleteConnection: async (id: string) => {
    await apiClient.delete(`/mcp/connections/${id}`)
  },

  updateAuth: async (id: string, data: UpdateMcpConnectionAuthRequest) => {
    const response = await apiClient.put<McpConnection>(`/mcp/connections/${id}/auth`, data)
    return response.data
  },

  testConnection: async (id: string) => {
    const response = await apiClient.post<McpConnection>(`/mcp/connections/${id}/test`)
    return response.data
  },

  syncConnection: async (id: string) => {
    const response = await apiClient.post<McpConnection>(`/mcp/connections/${id}/sync`)
    return response.data
  },

  listConnectionTools: async (id: string) => {
    const response = await apiClient.get<McpTool[]>(`/mcp/connections/${id}/tools`)
    return response.data
  },

  listSelectableTools: async () => {
    const response = await apiClient.get<McpTool[]>('/mcp/tools/selectable')
    return response.data
  },

  listSessionToolCalls: async (sessionId: string) => {
    const response = await apiClient.get<ChatToolCall[]>(
      `/mcp/sessions/${sessionId}/tool-calls`
    )
    return response.data
  },
}
