import { describe, expect, it } from 'vitest'
import {
  EXCERPT_SCAN_MAX_PAGES,
  excerptScanLimit,
  pageTextFromContent,
} from '@/components/source/PdfCitationViewer'

describe('PdfCitationViewer helpers', () => {
  it('joins pdf.js text items with spaces', () => {
    expect(pageTextFromContent([{ str: 'Hello' }, { str: 'world' }])).toBe(
      'Hello world'
    )
    expect(pageTextFromContent([{ str: 'only' }])).toBe('only')
  })

  it('caps excerpt scan page count', () => {
    expect(excerptScanLimit(3)).toBe(3)
    expect(excerptScanLimit(100)).toBe(EXCERPT_SCAN_MAX_PAGES)
    expect(excerptScanLimit(0)).toBe(0)
  })
})
