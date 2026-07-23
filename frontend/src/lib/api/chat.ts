import apiClient, { getAuthToken } from '@/lib/api/client'
import {
  ProjectChatSession,
  ProjectChatSessionWithMessages,
  CreateProjectChatSessionRequest,
  UpdateProjectChatSessionRequest,
  SendProjectChatMessageRequest,
  BuildContextRequest,
  BuildContextResponse,
  ChatSuggestionsRequest,
  ChatSuggestionsResponse,
} from '@/lib/types/api'

const GUEST_KEY_HEADER = 'X-Guest-Key'

function guestHeaders(guestKey?: string | null): Record<string, string> {
  if (!guestKey) return {}
  return { [GUEST_KEY_HEADER]: guestKey }
}

export const chatApi = {
  // Session management
  listSessions: async (projectId: string, guestKey?: string | null) => {
    const response = await apiClient.get<ProjectChatSession[]>(
      `/chat/sessions`,
      {
        params: { project_id: projectId },
        headers: guestHeaders(guestKey),
      }
    )
    return response.data
  },

  createSession: async (
    data: CreateProjectChatSessionRequest,
    guestKey?: string | null
  ) => {
    const response = await apiClient.post<ProjectChatSession>(
      `/chat/sessions`,
      {
        ...data,
        ...(guestKey ? { guest_key: guestKey } : {}),
      },
      { headers: guestHeaders(guestKey) }
    )
    return response.data
  },

  getSession: async (sessionId: string, guestKey?: string | null) => {
    const response = await apiClient.get<ProjectChatSessionWithMessages>(
      `/chat/sessions/${sessionId}`,
      { headers: guestHeaders(guestKey) }
    )
    return response.data
  },

  updateSession: async (
    sessionId: string,
    data: UpdateProjectChatSessionRequest,
    guestKey?: string | null
  ) => {
    const response = await apiClient.put<ProjectChatSession>(
      `/chat/sessions/${sessionId}`,
      data,
      { headers: guestHeaders(guestKey) }
    )
    return response.data
  },

  deleteSession: async (sessionId: string, guestKey?: string | null) => {
    await apiClient.delete(`/chat/sessions/${sessionId}`, {
      headers: guestHeaders(guestKey),
    })
  },

  // Messaging with AG-UI SSE streaming
  sendMessage: (data: SendProjectChatMessageRequest, guestKey?: string | null) => {
    const token = getAuthToken()
    const url = '/api/chat/execute'

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...guestHeaders(guestKey),
      },
      body: JSON.stringify(data),
    }).then(async (response) => {
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorData.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }
      if (!response.body) {
        throw new Error('No response body received')
      }
      return response.body
    })
  },

  buildContext: async (data: BuildContextRequest) => {
    const response = await apiClient.post<BuildContextResponse>(
      `/chat/context`,
      data
    )
    return response.data
  },

  getSuggestions: async (
    data: ChatSuggestionsRequest,
    guestKey?: string | null
  ) => {
    const response = await apiClient.post<ChatSuggestionsResponse>(
      `/chat/suggestions`,
      data,
      { headers: guestHeaders(guestKey) }
    )
    return response.data
  },
}
