import { describe, expect, it } from 'vitest'
import { getCollapsedFocusToolCall } from '@/components/mcp/tool-call-display'
import type { ChatToolCall } from '@/lib/types/mcp'

function makeCall(
  overrides: Partial<ChatToolCall> & Pick<ChatToolCall, 'id' | 'tool_name' | 'status'>
): ChatToolCall {
  return {
    session_id: 'session-1',
    ...overrides,
  }
}

describe('getCollapsedFocusToolCall', () => {
  it('returns null for an empty list', () => {
    expect(getCollapsedFocusToolCall([])).toBeNull()
  })

  it('prefers a running call over requested and completed', () => {
    const focus = getCollapsedFocusToolCall([
      makeCall({ id: '1', tool_name: 'done', status: 'succeeded' }),
      makeCall({ id: '2', tool_name: 'queued', status: 'requested' }),
      makeCall({ id: '3', tool_name: 'active', status: 'running' }),
    ])
    expect(focus?.tool_name).toBe('active')
  })

  it('falls back to requested when nothing is running', () => {
    const focus = getCollapsedFocusToolCall([
      makeCall({ id: '1', tool_name: 'done', status: 'succeeded' }),
      makeCall({ id: '2', tool_name: 'queued', status: 'requested' }),
    ])
    expect(focus?.tool_name).toBe('queued')
  })

  it('falls back to the latest call when the turn is idle', () => {
    const focus = getCollapsedFocusToolCall([
      makeCall({ id: '1', tool_name: 'first', status: 'succeeded' }),
      makeCall({ id: '2', tool_name: 'last', status: 'succeeded' }),
    ])
    expect(focus?.tool_name).toBe('last')
  })
})
