export const IN_PROGRESS_STATUSES = [
  'queued',
  'inspecting',
  'extracting',
  'validating',
  'publishing',
] as const

export const PIPELINE_STAGES = [
  'queued',
  'inspecting',
  'extracting',
  'validating',
  'publishing',
] as const

export type InProgressStatus = (typeof IN_PROGRESS_STATUSES)[number]

export function countByType(items: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const type = String(item.item_type || 'unknown')
    counts[type] = (counts[type] || 0) + 1
  }
  return counts
}

export function isInProgressStatus(status: string | undefined): status is InProgressStatus {
  return Boolean(
    status && (IN_PROGRESS_STATUSES as readonly string[]).includes(status)
  )
}

export function stageLabelKey(status: string): string {
  switch (status) {
    case 'queued':
      return 'sources.drawingStageQueued'
    case 'inspecting':
      return 'sources.drawingStageInspecting'
    case 'extracting':
      return 'sources.drawingStageExtracting'
    case 'validating':
      return 'sources.drawingStageValidating'
    case 'publishing':
      return 'sources.drawingStagePublishing'
    case 'completed':
      return 'sources.drawingStageCompleted'
    case 'partial':
      return 'sources.drawingStagePartial'
    case 'failed':
      return 'sources.drawingStageFailed'
    case 'skipped':
      return 'sources.drawingStageSkipped'
    default:
      return 'sources.drawingStageExtracting'
  }
}

export function progressPercent(
  status: string | undefined,
  pagesProcessed: number,
  pageCount: number
): number {
  switch (status) {
    case 'queued':
      return 4
    case 'inspecting':
      return 10
    case 'extracting': {
      if (pageCount <= 0) return 18
      const ratio = Math.min(1, Math.max(0, pagesProcessed / pageCount))
      return Math.round(18 + ratio * 62)
    }
    case 'validating':
      return 84
    case 'publishing':
      return 92
    case 'completed':
    case 'partial':
      return 100
    case 'failed':
    case 'skipped':
      return 100
    default:
      return 8
  }
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function showStatusBadge(status: string | undefined): boolean {
  if (!status) return false
  if (status === 'completed') return false
  return true
}

export function formatBand(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.replace(/_/g, ' ')
}

export function pageLabel(page: Record<string, unknown>): string {
  const sheet = page.sheet_number
  if (typeof sheet === 'string' && sheet.trim()) return sheet.trim()
  const index = asNumber(page.page_index, 0)
  return `Page ${index + 1}`
}
