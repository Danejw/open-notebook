import { describe, expect, it } from 'vitest'
import { extractHtmlFromChatContent } from '@/lib/utils/extract-html-from-chat'

describe('extractHtmlFromChatContent', () => {
  it('extracts a fenced html block', () => {
    const content = `Here is the fill:\n\n\`\`\`html\n<html><body><span>Hi</span></body></html>\n\`\`\`\n\nDone.`
    expect(extractHtmlFromChatContent(content)).toBe(
      '<html><body><span>Hi</span></body></html>'
    )
  })

  it('falls back to full document when doctype/html present', () => {
    const html = '<!DOCTYPE html><html><body>x</body></html>'
    expect(extractHtmlFromChatContent(html)).toBe(html)
  })

  it('returns null for plain prose', () => {
    expect(extractHtmlFromChatContent('Just a normal reply.')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(extractHtmlFromChatContent('')).toBeNull()
    expect(extractHtmlFromChatContent('   ')).toBeNull()
  })
})
