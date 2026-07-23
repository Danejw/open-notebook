import { describe, expect, it } from 'vitest'
import {
  EVIDENCE_FOCUS_EVENT,
  parseEvidenceFocusEvent,
} from '@/lib/ag-ui/evidence-focus'

describe('parseEvidenceFocusEvent', () => {
  it('parses valid evidence_focus payload', () => {
    const parsed = parseEvidenceFocusEvent({
      type: 'CUSTOM',
      name: EVIDENCE_FOCUS_EVENT,
      value: {
        items: [
          {
            sourceId: 'source:abc',
            chunkId: 'source_embedding:1',
            page: 2,
            charStart: 10,
            charEnd: 40,
            excerpt: 'warranty clause',
          },
        ],
      },
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.items).toHaveLength(1)
    expect(parsed?.items[0]?.sourceId).toBe('source:abc')
    expect(parsed?.items[0]?.page).toBe(2)
    expect(parsed?.items[0]?.excerpt).toBe('warranty clause')
  })

  it('returns null for other custom events', () => {
    expect(
      parseEvidenceFocusEvent({
        type: 'CUSTOM',
        name: 'agent_progress',
        value: { phase: 'started', step: 'generating' },
      })
    ).toBeNull()
  })
})
