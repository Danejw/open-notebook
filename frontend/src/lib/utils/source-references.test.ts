import { describe, expect, it } from 'vitest'
import { convertReferencesToCompactMarkdown } from '@/lib/utils/source-references'

describe('convertReferencesToCompactMarkdown', () => {
  it('turns source tokens into numbered #ref-source links', () => {
    const result = convertReferencesToCompactMarkdown(
      'Findings from [source:abc123] apply here.',
      'References',
      { source: 'Source', note: 'Note' }
    )

    expect(result).toContain('[1](#ref-source-abc123)')
    expect(result).toContain('[1 · Source](#ref-source-abc123)')
  })

  it('turns note tokens into numbered #ref-note links', () => {
    const result = convertReferencesToCompactMarkdown(
      'See [note:xyz789] as well.',
      'References',
      { source: 'Source', note: 'Note' }
    )

    expect(result).toContain('[1](#ref-note-xyz789)')
    expect(result).toContain('[1 · Note](#ref-note-xyz789)')
  })
})
