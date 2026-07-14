/** Client-side span helpers mirroring backend html_spans.py */

const SPAN_RE = /(<span\b[^>]*>)(.*?)(<\/span>)/gi

export interface ClientSpanField {
  index: number
  text: string
}

export function extractSpans(html: string): ClientSpanField[] {
  const spans: ClientSpanField[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(SPAN_RE.source, SPAN_RE.flags)
  let index = 0
  while ((match = re.exec(html)) !== null) {
    spans.push({ index, text: match[2] ?? '' })
    index += 1
  }
  return spans
}
