import type { Dispatch, SetStateAction } from 'react'

/** Optimistic human message appended before an SSE chat turn. */
export interface OptimisticHumanMessage {
  id: string
  type: 'human'
  content: string
  timestamp: string
}

/** Create the optimistic user message used by project and source chat. */
export function createOptimisticHumanMessage(content: string): OptimisticHumanMessage {
  return {
    id: `temp-${Date.now()}`,
    type: 'human',
    content,
    timestamp: new Date().toISOString(),
  }
}

/** Default session title when auto-creating a chat session from the first message. */
export function defaultSessionTitleFromMessage(message: string): string {
  return message.length > 30 ? `${message.substring(0, 30)}...` : message
}

/** Factory for AI messages in AG-UI SSE handlers (project + source chat). */
export function createDefaultAiMessage<
  T extends { id: string; type: 'ai'; content: string; timestamp?: string },
>(id: string, content: string): T {
  return {
    id,
    type: 'ai',
    content,
    timestamp: new Date().toISOString(),
  } as T
}

export interface StreamTurnResetSetters {
  setStreamStatus: Dispatch<SetStateAction<string | null>>
  setActivityLog: Dispatch<SetStateAction<string[]>>
  setLiveMcpToolCalls: Dispatch<SetStateAction<unknown[]>>
}

/** Reset per-turn streaming UI state before a new SSE response. */
export function resetStreamTurnState({
  setStreamStatus,
  setActivityLog,
  setLiveMcpToolCalls,
}: StreamTurnResetSetters): void {
  setStreamStatus(null)
  setActivityLog([])
  setLiveMcpToolCalls([])
}

export interface EnsureChatSessionOptions {
  currentSessionId: string | null
  message: string
  createSession: (title: string) => Promise<{ id: string }>
}

export interface EnsureChatSessionResult {
  sessionId: string
  created: boolean
}

/** Auto-create a chat session from the first message when none is selected. */
export async function ensureChatSessionForMessage(
  options: EnsureChatSessionOptions
): Promise<EnsureChatSessionResult> {
  if (options.currentSessionId) {
    return { sessionId: options.currentSessionId, created: false }
  }
  const title = defaultSessionTitleFromMessage(options.message)
  const session = await options.createSession(title)
  return { sessionId: session.id, created: true }
}
