import apiClient from '@/lib/api/client'
import type { CommandJobStatusResponse } from '@/lib/api/command-status'

export interface KnowledgeExtractorInfo {
  id: string
  label: string
  version: string
  auto_run: boolean
  last_run?: {
    status?: string
    stats?: Record<string, number>
    started_at?: string
    finished_at?: string
    error_message?: string
    command_id?: string
  }
}

export interface KnowledgeEntity {
  id: string
  type: string
  label: string
  normalized_key?: string
  source_id?: string
  confidence?: number
  metadata?: Record<string, unknown>
}

export const knowledgeApi = {
  listExtractors: async (sourceId: string) => {
    const response = await apiClient.get<{ extractors: KnowledgeExtractorInfo[] }>(
      `/sources/${encodeURIComponent(sourceId)}/knowledge/extractors`
    )
    return response.data
  },

  extract: async (
    sourceId: string,
    data: { extractor: string; project_id?: string; force?: boolean }
  ) => {
    const response = await apiClient.post<{
      command_id: string
      source_id: string
      extractor: string
    }>(`/sources/${encodeURIComponent(sourceId)}/knowledge/extract`, data)
    return response.data
  },

  getSourceKnowledge: async (sourceId: string) => {
    const response = await apiClient.get<{
      entities: KnowledgeEntity[]
      claims: unknown[]
      relations: unknown[]
      runs: unknown[]
    }>(`/sources/${encodeURIComponent(sourceId)}/knowledge`)
    return response.data
  },

  getCommandStatus: async (commandId: string) => {
    const response = await apiClient.get<CommandJobStatusResponse>(
      `/commands/jobs/${encodeURIComponent(commandId)}`
    )
    return response.data
  },

  /**
   * Poll a knowledge-extract command until it reaches a terminal status.
   */
  waitForCommand: async (
    commandId: string,
    options?: { maxAttempts?: number; intervalMs?: number }
  ): Promise<CommandJobStatusResponse> => {
    const maxAttempts = options?.maxAttempts ?? 90
    const intervalMs = options?.intervalMs ?? 2000

    let last: CommandJobStatusResponse = {
      job_id: commandId,
      status: 'queued',
    }

    for (let i = 0; i < maxAttempts; i++) {
      last = await knowledgeApi.getCommandStatus(commandId)
      if (last.status === 'completed' || last.status === 'failed') {
        return last
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    return last
  },
}
