/**
 * Format AG-UI agent_progress CUSTOM events into live status + log lines.
 */

export const AGENT_PROGRESS_EVENT = 'agent_progress'

export type AgentProgressPhase = 'started' | 'progress' | 'completed'

export type AgentProgressStep =
  | 'loading_skills'
  | 'retrieving_context'
  | 'generating'
  | 'verifying_citations'
  | 'strategy'
  | 'provide_answer'
  | 'write_final_answer'
  | string

export interface AgentProgressDetail {
  skillId?: string
  skillName?: string
  skillIndex?: number
  skillTotal?: number
  charCount?: number
  sourceCount?: number
  noteCount?: number
  tokenCount?: number
  /** Hybrid / vector / graph mode actually used for this turn's retrieve */
  retrievalModeUsed?: string | null
  /** Why retrieve fell back (e.g. graph_empty_or_unavailable), if any */
  fallbackReason?: string | null
  /** Indexed embedding dim drift vs active model (rebuild recommended) */
  embeddingDimWarning?: string | null
  /** Count of citations stripped as not in retrieved evidence (RAG-015) */
  citationViolations?: number
  /** Removed citation IDs (capped server-side) */
  removedCitationIds?: string[]
  /** Count of citations that matched allowed evidence */
  keptCitationCount?: number
  searchQueries?: number
  searchTerm?: string
  resultCount?: number
  answerCount?: number
  queryRunId?: string
}

export interface AgentProgressPayload {
  phase: AgentProgressPhase
  step: AgentProgressStep
  detail?: AgentProgressDetail
  message?: string
}

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    const rounded = Math.round(tokens / 100) / 10
    return `~${rounded}k`
  }
  return `~${tokens}`
}

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join(' · ')
}

/** Live status text for started/progress (and generating completed is unused). */
export function formatAgentProgressStatus(
  payload: AgentProgressPayload,
  t: TranslateFn
): string | null {
  const detail = payload.detail || {}
  const { phase, step } = payload

  switch (step) {
    case 'loading_skills': {
      if (phase === 'progress' || phase === 'started') {
        const name = detail.skillName
        const index = detail.skillIndex
        const total = detail.skillTotal
        if (name && index && total) {
          return t('agentProgress.loadingSkillNamed', {
            name,
            index,
            total,
          })
        }
        if (index && total) {
          return t('agentProgress.loadingSkillIndex', { index, total })
        }
        if (total) {
          return t('agentProgress.loadingSkillsCount', { total })
        }
        return t('agentSteps.loading_skills')
      }
      return null
    }
    case 'retrieving_context': {
      if (phase === 'started' || phase === 'progress') {
        return t('agentSteps.retrieving_context')
      }
      return null
    }
    case 'generating': {
      if (phase === 'started' || phase === 'progress') {
        return t('agentSteps.generating')
      }
      return null
    }
    case 'strategy': {
      if (phase === 'started' || phase === 'progress') {
        return t('agentSteps.strategy')
      }
      return null
    }
    case 'provide_answer': {
      if (phase === 'progress' || phase === 'started') {
        if (detail.searchTerm) {
          return t('agentProgress.searchingTerm', { term: detail.searchTerm })
        }
        return t('agentSteps.provide_answer')
      }
      return null
    }
    case 'write_final_answer': {
      if (phase === 'started' || phase === 'progress') {
        if (detail.answerCount != null) {
          return t('agentProgress.writingFinalFromAnswers', {
            count: detail.answerCount,
          })
        }
        return t('agentSteps.write_final_answer')
      }
      return null
    }
    default:
      return payload.message || null
  }
}

/** Completed log line; null if this completion shouldn't be logged. */
export function formatAgentProgressLogLine(
  payload: AgentProgressPayload,
  t: TranslateFn
): string | null {
  if (payload.phase !== 'completed') {
    return null
  }
  const detail = payload.detail || {}
  const { step } = payload

  switch (step) {
    case 'loading_skills': {
      if (detail.skillName) {
        return t('agentProgress.loadedSkill', { name: detail.skillName })
      }
      return null
    }
    case 'retrieving_context': {
      const parts: string[] = []
      if (detail.sourceCount) {
        parts.push(
          t('agentProgress.countSources', { count: detail.sourceCount })
        )
      }
      if (detail.noteCount) {
        parts.push(t('agentProgress.countNotes', { count: detail.noteCount }))
      }
      const counts = joinParts(parts) || t('agentProgress.noContextItems')
      if (detail.tokenCount != null && detail.tokenCount > 0) {
        return t('agentProgress.retrievedContextWithTokens', {
          counts,
          tokens: formatTokenCount(detail.tokenCount),
        })
      }
      return t('agentProgress.retrievedContext', { counts })
    }
    case 'generating':
      return null
    case 'strategy': {
      const queries = detail.searchQueries ?? 0
      return t('agentProgress.plannedSearches', { count: queries })
    }
    case 'provide_answer': {
      const term = detail.searchTerm || t('agentProgress.unknownTerm')
      const results = detail.resultCount ?? 0
      return t('agentProgress.answeredSearch', { term, results })
    }
    case 'write_final_answer': {
      return t('agentProgress.wroteFinalAnswer')
    }
    default:
      return payload.message || null
  }
}

export function parseAgentProgressEvent(event: {
  name?: string
  value?: unknown
}): AgentProgressPayload | null {
  if (event.name !== AGENT_PROGRESS_EVENT) {
    return null
  }
  const value = event.value
  if (!value || typeof value !== 'object') {
    return null
  }
  const data = value as Record<string, unknown>
  if (typeof data.phase !== 'string' || typeof data.step !== 'string') {
    return null
  }
  return {
    phase: data.phase as AgentProgressPhase,
    step: data.step as AgentProgressStep,
    detail: (data.detail as AgentProgressDetail) || {},
    message: typeof data.message === 'string' ? data.message : undefined,
  }
}
