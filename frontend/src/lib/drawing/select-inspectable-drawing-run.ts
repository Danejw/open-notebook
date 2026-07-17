import type { DrawingExtractionRun } from '@/lib/api/drawing-extraction'

const INSPECTABLE_STATUSES = new Set(['completed', 'partial'])

/**
 * Prefer an active completed/partial drawing run; otherwise the first
 * completed/partial run in list order. Returns null when none qualify.
 */
export function selectInspectableDrawingRun(
  runs: DrawingExtractionRun[] | undefined | null
): DrawingExtractionRun | null {
  if (!runs?.length) return null

  const inspectable = runs.filter((run) => INSPECTABLE_STATUSES.has(run.status))
  if (inspectable.length === 0) return null

  const active = inspectable.find((run) => run.active === true)
  return active ?? inspectable[0] ?? null
}
