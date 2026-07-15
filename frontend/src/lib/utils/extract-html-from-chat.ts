/**
 * Extract HTML suitable for saving as a bid document from an AI chat reply.
 * Prefers a fenced ```html block; falls back to a full HTML document body.
 */
export function extractHtmlFromChatContent(content: string): string | null {
  const text = (content || '').trim()
  if (!text) return null

  const fenced = text.match(/```html\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim()
  }

  const lower = text.toLowerCase()
  if (lower.includes('<!doctype html') || lower.includes('<html')) {
    // Strip accidental outer fences without language tag
    const genericFence = text.match(/```\s*([\s\S]*?)```/)
    if (genericFence?.[1]?.trim() && /<html/i.test(genericFence[1])) {
      return genericFence[1].trim()
    }
    return text
  }

  return null
}
