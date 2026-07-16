/** Chat-context inclusion mode for a project source or note. */
export type ContextMode = 'off' | 'full'

/** Normalize legacy stored modes (e.g. 'insights') to the current union. */
export function normalizeContextMode(mode: string | undefined | null): ContextMode {
  if (mode === 'full' || mode === 'off') return mode
  if (mode === 'insights') return 'full'
  return 'off'
}

export type NoteContextMode = ContextMode

export interface ContextSelections {
  sources: Record<string, ContextMode>
  notes: Record<string, NoteContextMode>
}
