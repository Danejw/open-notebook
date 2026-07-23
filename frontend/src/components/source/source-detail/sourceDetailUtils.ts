import type { EvidenceFocusItem } from '@/lib/ag-ui/evidence-focus'

/** OCR / drawing dumps are often one long line — mono + wrap is more scannable than Markdown. */
export function isDensePlainExtraction(text: string): boolean {
  if (text.length < 400) return false
  const newlines = (text.match(/\n/g) ?? []).length
  return newlines / text.length < 0.008
}

export function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function extractFilename(pathOrUrl: string | undefined, fallback: string): string {
  if (!pathOrUrl) {
    return fallback
  }
  const segments = pathOrUrl.split(/[/\\]/)
  return segments.pop() || fallback
}

export function parseContentDisposition(header?: string | null): string | null {
  if (!header) {
    return null
  }
  const match = header.match(/filename\*?=([^;]+)/i)
  if (!match) {
    return null
  }
  const value = match[1].trim()
  if (value.toLowerCase().startsWith("utf-8''")) {
    return decodeURIComponent(value.slice(7))
  }
  return value.replace(/^["']|["']$/g, '')
}

/** Match citation focus to this source id (with or without `source:` prefix). */
export function focusForSource(
  activeFocus: EvidenceFocusItem | null,
  sourceId: string
): EvidenceFocusItem | null {
  if (!activeFocus) return null
  const matches =
    activeFocus.sourceId === sourceId ||
    activeFocus.sourceId === sourceId.replace(/^source:/, '') ||
    `source:${activeFocus.sourceId.replace(/^source:/, '')}` === sourceId
  return matches ? activeFocus : null
}

export function isPdfAssetPath(pathOrUrl: string): boolean {
  return pathOrUrl.toLowerCase().endsWith('.pdf')
}

export type HighlightedTextView = {
  before: string
  match: string
  after: string
}

export function buildHighlightedTextView(
  contentText: string,
  focus: EvidenceFocusItem | null
): HighlightedTextView | null {
  if (!contentText || !focus || focus.charStart == null || focus.charEnd == null) {
    return null
  }
  const start = Math.max(0, focus.charStart)
  const end = Math.min(contentText.length, focus.charEnd)
  if (end <= start) {
    return null
  }
  return {
    before: contentText.slice(0, start),
    match: contentText.slice(start, end),
    after: contentText.slice(end),
  }
}
