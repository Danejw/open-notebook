import type { ContextMode, NoteContextMode } from '@/lib/types/project-context'
import { normalizeContextMode } from '@/lib/types/project-context'

/**
 * Bulk context actions for sources:
 * - `include`  → full content
 * - `full`     → full content for every source
 * - `exclude`  → excluded from context
 */
export type SourceContextDefault = 'include' | 'full' | 'exclude'

/** The subset of actions surfaced as explicit bulk menu items. */
export type SourceBulkAction = Exclude<SourceContextDefault, 'include'>

interface SourceLike {
  id: string
}

/** The "included" context mode for a source. */
export function includedMode(): ContextMode {
  return 'full'
}

/** Resolve the context mode a bulk action implies for a single source. */
export function bulkModeForSource(mode: SourceContextDefault): ContextMode {
  switch (mode) {
    case 'exclude':
      return 'off'
    case 'full':
    case 'include':
      return 'full'
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
}

/**
 * Compute chat-context selections for a batch of sources while preserving
 * existing choices. Legacy 'insights' modes normalize to 'full'.
 */
export function computeSourceSelections(
  existing: Record<string, ContextMode>,
  sources: SourceLike[],
  defaultMode: SourceContextDefault = 'include',
): Record<string, ContextMode> {
  const next: Record<string, ContextMode> = {}
  for (const [id, mode] of Object.entries(existing)) {
    next[id] = normalizeContextMode(mode)
  }
  for (const source of sources) {
    const current = next[source.id]
    if (current === undefined) {
      next[source.id] = bulkModeForSource(defaultMode)
    }
  }
  return next
}

/** Apply a uniform bulk context action to every given source. */
export function applyBulkSourceContext(
  existing: Record<string, ContextMode>,
  sources: SourceLike[],
  action: SourceContextDefault,
): Record<string, ContextMode> {
  const next = { ...existing }
  for (const source of sources) {
    next[source.id] = bulkModeForSource(action)
  }
  return next
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Bulk context actions for notes. `include` maps to full content. */
export type NoteContextDefault = 'include' | 'exclude'

interface NoteLike {
  id: string
}

/** Resolve the context mode a bulk action implies for a single note. */
export function bulkModeForNote(action: NoteContextDefault): NoteContextMode {
  return action === 'exclude' ? 'off' : 'full'
}

/**
 * Compute chat-context selections for a batch of notes while preserving
 * existing choices. Newly-seen notes adopt `defaultAction` so a prior bulk
 * action also governs notes that load later.
 */
export function computeNoteSelections(
  existing: Record<string, NoteContextMode>,
  notes: NoteLike[],
  defaultAction: NoteContextDefault = 'include',
): Record<string, NoteContextMode> {
  const next = { ...existing }
  for (const note of notes) {
    if (next[note.id] === undefined) {
      next[note.id] = bulkModeForNote(defaultAction)
    }
  }
  return next
}

/** Apply a uniform bulk context action to every given note. */
export function applyBulkNoteContext(
  existing: Record<string, NoteContextMode>,
  notes: NoteLike[],
  action: NoteContextDefault,
): Record<string, NoteContextMode> {
  const next = { ...existing }
  for (const note of notes) {
    next[note.id] = bulkModeForNote(action)
  }
  return next
}
