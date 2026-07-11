import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
})

export const QUERY_KEYS = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  artifacts: ['artifacts'] as const,
  artifact: (id: string) => ['artifacts', id] as const,
  artifactDefaultPrompt: ['artifacts', 'default-prompt'] as const,
  notes: (projectId?: string) => ['notes', projectId] as const,
  note: (id: string) => ['notes', id] as const,
  sources: (projectId?: string) => ['sources', projectId] as const,
  sourcesInfinite: (projectId: string) => ['sources', 'infinite', projectId] as const,
  sourcesAllInfinite: (sortBy: string, sortOrder: string) =>
    ['sources', 'all', sortBy, sortOrder] as const,
  source: (id: string) => ['sources', id] as const,
  settings: ['settings'] as const,
  sourceChatSessions: (sourceId: string) => ['source-chat', sourceId, 'sessions'] as const,
  sourceChatSession: (sourceId: string, sessionId: string) => ['source-chat', sourceId, 'sessions', sessionId] as const,
  projectChatSessions: (projectId: string) => ['project-chat', projectId, 'sessions'] as const,
  projectChatSession: (sessionId: string) => ['project-chat', 'sessions', sessionId] as const,
  podcastEpisodes: ['podcasts', 'episodes'] as const,
  podcastEpisode: (episodeId: string) => ['podcasts', 'episodes', episodeId] as const,
  episodeProfiles: ['podcasts', 'episode-profiles'] as const,
  speakerProfiles: ['podcasts', 'speaker-profiles'] as const,
  languages: ['languages'] as const,
  skills: ['skills'] as const,
  skill: (id: string) => ['skills', id] as const,
  skillsCatalog: ['skills', 'catalog'] as const,
  mcpConnections: ['mcp', 'connections'] as const,
  mcpConnection: (id: string) => ['mcp', 'connections', id] as const,
  mcpConnectionTools: (id: string) => ['mcp', 'connections', id, 'tools'] as const,
  mcpSelectableTools: ['mcp', 'tools', 'selectable'] as const,
  mcpSessionToolCalls: (sessionId: string) => ['mcp', 'sessions', sessionId, 'tool-calls'] as const,
}
