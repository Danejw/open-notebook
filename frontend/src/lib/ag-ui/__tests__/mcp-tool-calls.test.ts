import { describe, expect, it } from 'vitest'
import {
  parseMcpToolCallEvent,
  TOOL_CALL_EVENT,
  MCP_TOOL_CALL_EVENT,
} from '@/lib/ag-ui/mcp-tool-calls'
import type { AgUiEvent } from '@/lib/ag-ui/events'

function customEvent(name: string, value: Record<string, unknown>): AgUiEvent {
  return {
    type: 'CUSTOM',
    name,
    value,
  } as AgUiEvent
}

describe('parseMcpToolCallEvent', () => {
  it('parses native tool_source and strips native__ from display name', () => {
    const parsed = parseMcpToolCallEvent(
      customEvent(MCP_TOOL_CALL_EVENT, {
        id: 'call:1',
        session_id: 'chat_session:1',
        tool_name: 'get_project_context',
        runtime_name: 'native__get_project_context',
        status: 'succeeded',
        tool_source: 'native',
        performed_write: false,
      })
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.tool_name).toBe('get_project_context')
    expect(parsed?.tool_source).toBe('native')
    expect(parsed?.performed_write).toBe(false)
  })

  it('infers native source from runtime_name prefix', () => {
    const parsed = parseMcpToolCallEvent(
      customEvent(TOOL_CALL_EVENT, {
        id: 'call:2',
        session_id: 'chat_session:1',
        tool_name: 'native__save_project_artifact',
        runtime_name: 'native__save_project_artifact',
        status: 'succeeded',
        performed_write: true,
      })
    )
    expect(parsed?.tool_name).toBe('save_project_artifact')
    expect(parsed?.tool_source).toBe('native')
    expect(parsed?.performed_write).toBe(true)
  })
})
