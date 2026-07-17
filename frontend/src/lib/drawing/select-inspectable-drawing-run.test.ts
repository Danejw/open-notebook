import { describe, expect, it } from 'vitest'
import type { DrawingExtractionRun } from '@/lib/api/drawing-extraction'
import { selectInspectableDrawingRun } from '@/lib/drawing/select-inspectable-drawing-run'

function run(
  overrides: Partial<DrawingExtractionRun> &
    Pick<DrawingExtractionRun, 'id' | 'source_id' | 'status'>
): DrawingExtractionRun {
  return { ...overrides }
}

describe('selectInspectableDrawingRun', () => {
  it('returns null for empty or missing runs', () => {
    expect(selectInspectableDrawingRun(undefined)).toBeNull()
    expect(selectInspectableDrawingRun(null)).toBeNull()
    expect(selectInspectableDrawingRun([])).toBeNull()
  })

  it('ignores non-completed / non-partial runs', () => {
    expect(
      selectInspectableDrawingRun([
        run({ id: '1', source_id: 's1', status: 'queued' }),
        run({ id: '2', source_id: 's1', status: 'extracting' }),
        run({ id: '3', source_id: 's1', status: 'failed' }),
      ])
    ).toBeNull()
  })

  it('returns the first completed or partial run when none are active', () => {
    const completed = run({ id: 'c1', source_id: 's1', status: 'completed' })
    const partial = run({ id: 'p1', source_id: 's1', status: 'partial' })
    expect(selectInspectableDrawingRun([completed, partial])).toEqual(completed)
    expect(
      selectInspectableDrawingRun([
        run({ id: 'q', source_id: 's1', status: 'queued' }),
        partial,
      ])
    ).toEqual(partial)
  })

  it('prefers the active completed/partial run', () => {
    const older = run({
      id: 'old',
      source_id: 's1',
      status: 'completed',
      active: false,
    })
    const active = run({
      id: 'active',
      source_id: 's1',
      status: 'partial',
      active: true,
    })
    expect(selectInspectableDrawingRun([older, active])).toEqual(active)
  })
})
