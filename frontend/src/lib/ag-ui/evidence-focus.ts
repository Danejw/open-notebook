/**
 * AG-UI evidence_focus CUSTOM event (RAG-012 citation deep-links).
 */

import type { AgUiEvent } from '@/lib/ag-ui/events'

export const EVIDENCE_FOCUS_EVENT = 'evidence_focus'

export interface EvidenceFocusItem {
  sourceId: string
  chunkId?: string
  page?: number
  charStart?: number
  charEnd?: number
  excerpt?: string
}

export interface EvidenceFocusPayload {
  items: EvidenceFocusItem[]
}

function optionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  const n = Math.trunc(value)
  return n >= 0 ? n : undefined
}

function parseFocusItem(raw: unknown): EvidenceFocusItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const record = raw as Record<string, unknown>
  if (typeof record.sourceId !== 'string' || !record.sourceId.trim()) {
    return null
  }
  const item: EvidenceFocusItem = { sourceId: record.sourceId.trim() }
  if (typeof record.chunkId === 'string' && record.chunkId.trim()) {
    item.chunkId = record.chunkId.trim()
  }
  const page = optionalPositiveInt(record.page)
  if (page !== undefined && page >= 1) {
    item.page = page
  }
  const charStart = optionalPositiveInt(record.charStart)
  if (charStart !== undefined) {
    item.charStart = charStart
  }
  const charEnd = optionalPositiveInt(record.charEnd)
  if (charEnd !== undefined) {
    item.charEnd = charEnd
  }
  if (typeof record.excerpt === 'string' && record.excerpt.trim()) {
    item.excerpt = record.excerpt.trim()
  }
  return item
}

export function parseEvidenceFocusEvent(
  event: AgUiEvent
): EvidenceFocusPayload | null {
  if (event.name !== EVIDENCE_FOCUS_EVENT) {
    return null
  }
  const value = event.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const rawItems = record.items
  if (!Array.isArray(rawItems)) {
    return null
  }
  const items: EvidenceFocusItem[] = []
  for (const entry of rawItems) {
    const parsed = parseFocusItem(entry)
    if (parsed) {
      items.push(parsed)
    }
  }
  return { items }
}
