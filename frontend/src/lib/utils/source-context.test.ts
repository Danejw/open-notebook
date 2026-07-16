import { describe, it, expect } from 'vitest'
import {
  applyBulkNoteContext,
  applyBulkSourceContext,
  bulkModeForSource,
  computeNoteSelections,
  computeSourceSelections,
  includedMode,
} from './source-context'

const src = (id: string) => ({ id })
const note = (id: string) => ({ id })

describe('includedMode', () => {
  it('returns full content mode', () => {
    expect(includedMode()).toBe('full')
  })
})

describe('bulkModeForSource', () => {
  it('full forces full content', () => {
    expect(bulkModeForSource('full')).toBe('full')
    expect(bulkModeForSource('include')).toBe('full')
  })

  it('exclude turns everything off', () => {
    expect(bulkModeForSource('exclude')).toBe('off')
  })
})

describe('computeSourceSelections', () => {
  it('defaults new sources to full when included', () => {
    const result = computeSourceSelections({}, [src('s:1'), src('s:2')], 'include')
    expect(result).toEqual({ 's:1': 'full', 's:2': 'full' })
  })

  it('defaults new sources to off when the default mode is exclude', () => {
    const result = computeSourceSelections({}, [src('s:1'), src('s:2')], 'exclude')
    expect(result).toEqual({ 's:1': 'off', 's:2': 'off' })
  })

  it('applies a full default to later-loaded sources', () => {
    const result = computeSourceSelections({}, [src('s:1'), src('s:2')], 'full')
    expect(result).toEqual({ 's:1': 'full', 's:2': 'full' })
  })

  it('preserves existing explicit selections', () => {
    const existing = { 's:1': 'off' as const }
    const result = computeSourceSelections(existing, [src('s:1'), src('s:2')], 'include')
    expect(result['s:1']).toBe('off')
    expect(result['s:2']).toBe('full')
  })

  it('normalizes legacy insights modes to full', () => {
    const result = computeSourceSelections({ 's:1': 'insights' as never }, [src('s:1')], 'include')
    expect(result['s:1']).toBe('full')
  })

  it('keeps later-loaded sources excluded after an exclude-all (regression for #915)', () => {
    let selections = applyBulkSourceContext({}, [src('s:1'), src('s:2')], 'exclude')
    expect(selections).toEqual({ 's:1': 'off', 's:2': 'off' })

    selections = computeSourceSelections(
      selections,
      [src('s:1'), src('s:2'), src('s:3'), src('s:4')],
      'exclude',
    )
    expect(selections).toEqual({ 's:1': 'off', 's:2': 'off', 's:3': 'off', 's:4': 'off' })
  })
})

describe('applyBulkSourceContext', () => {
  it('excludes all sources', () => {
    const result = applyBulkSourceContext(
      { 's:1': 'full', 's:2': 'full' },
      [src('s:1'), src('s:2')],
      'exclude',
    )
    expect(result).toEqual({ 's:1': 'off', 's:2': 'off' })
  })

  it('includes all sources as full content', () => {
    const result = applyBulkSourceContext(
      { 's:1': 'off', 's:2': 'off' },
      [src('s:1'), src('s:2')],
      'include',
    )
    expect(result).toEqual({ 's:1': 'full', 's:2': 'full' })
  })

  it('full forces full content on every source', () => {
    const result = applyBulkSourceContext(
      { 's:1': 'off', 's:2': 'full' },
      [src('s:1'), src('s:2')],
      'full',
    )
    expect(result).toEqual({ 's:1': 'full', 's:2': 'full' })
  })
})

describe('note context', () => {
  it('defaults new notes to full (included)', () => {
    expect(computeNoteSelections({}, [note('n:1'), note('n:2')], 'include')).toEqual({
      'n:1': 'full',
      'n:2': 'full',
    })
  })

  it('defaults new notes to off when excluded', () => {
    expect(computeNoteSelections({}, [note('n:1')], 'exclude')).toEqual({ 'n:1': 'off' })
  })

  it('preserves existing note selections', () => {
    expect(computeNoteSelections({ 'n:1': 'off' }, [note('n:1'), note('n:2')], 'include')).toEqual({
      'n:1': 'off',
      'n:2': 'full',
    })
  })

  it('bulk includes/excludes all notes', () => {
    expect(applyBulkNoteContext({ 'n:1': 'off' }, [note('n:1'), note('n:2')], 'include')).toEqual({
      'n:1': 'full',
      'n:2': 'full',
    })
    expect(applyBulkNoteContext({ 'n:1': 'full' }, [note('n:1')], 'exclude')).toEqual({
      'n:1': 'off',
    })
  })
})
