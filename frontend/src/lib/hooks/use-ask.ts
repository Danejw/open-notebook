'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { searchApi } from '@/lib/api/search'
import {
  agentStepI18nKey,
  readAgUiSseStream,
  type AgUiEvent,
} from '@/lib/ag-ui/events'
import {
  formatAgentProgressLogLine,
  formatAgentProgressStatus,
  parseAgentProgressEvent,
} from '@/lib/ag-ui/progress'

interface AskModels {
  strategy: string
  answer: string
  finalAnswer: string
}

interface StrategyData {
  reasoning: string
  searches: Array<{
    term: string
    instructions: string
  }>
}

interface AskState {
  isStreaming: boolean
  streamStatus: string | null
  activityLog: string[]
  strategy: StrategyData | null
  answers: string[]
  finalAnswer: string | null
  error: string | null
}

function parseStrategy(value: unknown): StrategyData | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Record<string, unknown>
  const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning : ''
  const searchesRaw = Array.isArray(raw.searches) ? raw.searches : []
  const searches = searchesRaw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      term: typeof s.term === 'string' ? s.term : '',
      instructions: typeof s.instructions === 'string' ? s.instructions : '',
    }))
  return { reasoning, searches }
}

export function useAsk() {
  const { t } = useTranslation()
  const [state, setState] = useState<AskState>({
    isStreaming: false,
    streamStatus: null,
    activityLog: [],
    strategy: null,
    answers: [],
    finalAnswer: null,
    error: null
  })

  const sendAsk = useCallback(async (
    question: string,
    models: AskModels,
    options?: { project_id?: string; retrieval_mode?: 'auto' | 'vector' | 'hybrid' | 'graph' }
  ) => {
    if (!question.trim()) {
      toast.error(t('apiErrors.pleaseEnterQuestion'))
      return
    }

    if (!models.strategy || !models.answer || !models.finalAnswer) {
      toast.error(t('apiErrors.pleaseConfigureModels'))
      return
    }

    setState({
      isStreaming: true,
      streamStatus: null,
      activityLog: [],
      strategy: null,
      answers: [],
      finalAnswer: null,
      error: null
    })

    try {
      const response = await searchApi.askKnowledgeBase({
        question,
        strategy_model: models.strategy,
        answer_model: models.answer,
        final_answer_model: models.finalAnswer,
        project_id: options?.project_id,
        retrieval_mode: options?.retrieval_mode ?? 'auto',
      })

      if (!response) {
        throw new Error('No response body received from server')
      }

      await readAgUiSseStream(response, (event: AgUiEvent) => {
        switch (event.type) {
          case 'STEP_STARTED': {
            if (typeof event.stepName === 'string') {
              setState((prev) => ({
                ...prev,
                streamStatus: t(agentStepI18nKey(event.stepName!)),
              }))
            }
            break
          }
          case 'CUSTOM': {
            const progress = parseAgentProgressEvent(event)
            if (!progress) {
              break
            }
            const status = formatAgentProgressStatus(progress, t)
            const logLine = formatAgentProgressLogLine(progress, t)
            setState((prev) => ({
              ...prev,
              streamStatus: status ?? prev.streamStatus,
              activityLog: logLine
                ? [...prev.activityLog, logLine]
                : prev.activityLog,
            }))
            break
          }
          case 'STATE_SNAPSHOT': {
            const snapshot = event.snapshot ?? {}
            const strategy = parseStrategy(snapshot.strategy)
            const answers = Array.isArray(snapshot.answers)
              ? snapshot.answers.filter((a): a is string => typeof a === 'string')
              : undefined
            const finalAnswer =
              typeof snapshot.final_answer === 'string'
                ? snapshot.final_answer
                : undefined

            setState((prev) => ({
              ...prev,
              strategy: strategy ?? prev.strategy,
              answers: answers ?? prev.answers,
              finalAnswer:
                finalAnswer !== undefined ? finalAnswer : prev.finalAnswer,
              isStreaming: finalAnswer ? false : prev.isStreaming,
              streamStatus: finalAnswer ? null : prev.streamStatus,
              activityLog: finalAnswer ? [] : prev.activityLog,
            }))
            break
          }
          case 'TEXT_MESSAGE_CONTENT':
          case 'TEXT_MESSAGE_CHUNK': {
            const delta =
              typeof event.delta === 'string'
                ? event.delta
                : typeof event.content === 'string'
                  ? event.content
                  : ''
            if (!delta) {
              break
            }
            setState((prev) => ({
              ...prev,
              finalAnswer: (prev.finalAnswer || '') + delta,
            }))
            break
          }
          case 'RUN_FINISHED': {
            setState((prev) => ({
              ...prev,
              isStreaming: false,
              streamStatus: null,
              activityLog: [],
            }))
            break
          }
          case 'RUN_ERROR': {
            throw new Error(
              typeof event.message === 'string'
                ? event.message
                : 'Stream error occurred'
            )
          }
          default:
            break
        }
      })

      setState((prev) => ({
        ...prev,
        isStreaming: false,
        streamStatus: null,
        activityLog: [],
      }))
    } catch (error) {
      const err = error as { message?: string }
      const errorMessage = err.message || 'An unexpected error occurred'
      console.error('Ask error:', error)

      setState((prev) => ({
        ...prev,
        isStreaming: false,
        streamStatus: null,
        activityLog: [],
        error: errorMessage
      }))

      toast.error(t('apiErrors.askFailed'), {
        description: getApiErrorMessage(errorMessage, (key) => t(key)),
      })
    }
  }, [t])

  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      streamStatus: null,
      activityLog: [],
      strategy: null,
      answers: [],
      finalAnswer: null,
      error: null
    })
  }, [])

  return {
    ...state,
    sendAsk,
    reset
  }
}
