import { create } from 'zustand'
import type { EvidenceFocusItem } from '@/lib/ag-ui/evidence-focus'

interface CitationFocusState {
  /** Latest turn focus map keyed by sourceId (first / highest wins). */
  bySourceId: Record<string, EvidenceFocusItem>
  /** Focus currently applied to the open source modal. */
  activeFocus: EvidenceFocusItem | null
  setTurnFocus: (items: EvidenceFocusItem[]) => void
  openWithFocus: (sourceId: string) => EvidenceFocusItem | null
  clearActiveFocus: () => void
}

function normalizeSourceId(id: string): string {
  const trimmed = id.trim()
  if (!trimmed) {
    return trimmed
  }
  return trimmed.includes(':') ? trimmed : `source:${trimmed}`
}

export const useCitationFocusStore = create<CitationFocusState>((set, get) => ({
  bySourceId: {},
  activeFocus: null,
  setTurnFocus: (items) => {
    const bySourceId: Record<string, EvidenceFocusItem> = {}
    for (const item of items) {
      const key = normalizeSourceId(item.sourceId)
      if (!key || bySourceId[key]) {
        continue
      }
      bySourceId[key] = { ...item, sourceId: key }
    }
    set({ bySourceId })
  },
  openWithFocus: (sourceId) => {
    const key = normalizeSourceId(sourceId)
    const focus = get().bySourceId[key] ?? null
    set({ activeFocus: focus })
    return focus
  },
  clearActiveFocus: () => set({ activeFocus: null }),
}))
