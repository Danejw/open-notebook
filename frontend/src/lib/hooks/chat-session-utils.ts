import type { ChatStreamMessage } from '@/lib/hooks/chat-sse-handlers'

/** Derive a default session title from the first user message (shared by project/source chat). */
export function deriveDefaultSessionTitle(
  message: string,
  maxLength = 30
): string {
  return message.length > maxLength
    ? `${message.substring(0, maxLength)}...`
    : message
}

/** Build an optimistic human message appended before the server confirms the turn. */
export function createOptimisticUserMessage<TMessage extends ChatStreamMessage>(
  message: string,
  factory?: (message: string, tempId: string) => TMessage
): TMessage {
  const tempId = `temp-${Date.now()}`
  if (factory) {
    return factory(message, tempId)
  }
  return {
    id: tempId,
    type: 'human',
    content: message,
    timestamp: new Date().toISOString(),
  } as TMessage
}

/** Remove optimistic temp-* messages after a failed send (when not editing). */
export function stripOptimisticMessages<TMessage extends { id: string }>(
  messages: TMessage[]
): TMessage[] {
  return messages.filter((msg) => !msg.id.startsWith('temp-'))
}

export interface EnsureChatSessionResult<TSession extends { id: string }> {
  sessionId: string
  created: boolean
  session: TSession | null
}

/** Auto-create a chat session from the first message when none is active. */
export async function ensureChatSessionForMessage<
  TSession extends { id: string },
>({
  currentSessionId,
  message,
  createSession,
}: {
  currentSessionId: string | null
  message: string
  createSession: (title: string) => Promise<TSession>
}): Promise<EnsureChatSessionResult<TSession>> {
  if (currentSessionId) {
    return { sessionId: currentSessionId, created: false, session: null }
  }
  const title = deriveDefaultSessionTitle(message)
  const session = await createSession(title)
  return { sessionId: session.id, created: true, session }
}
