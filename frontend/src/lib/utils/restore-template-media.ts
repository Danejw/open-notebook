/**
 * Restore logo/library <img> tags from the original template when chat output
 * rewrote them to relative paths, empty src, or other non-resolvable values.
 */

const IMG_TAG_RE = /<img\b[^>]*>/gi
const IMG_SRC_RE = /src\s*=\s*["']([^"']*)["']/i

function imgSrc(tag: string): string {
  const match = IMG_SRC_RE.exec(tag)
  return (match?.[1] ?? '').trim()
}

function isResolvableMediaSrc(src: string): boolean {
  if (!src) return false
  if (src.startsWith('data:')) return true
  if (src.includes('/api/media/') && src.includes('/file')) return true
  if (src.startsWith('http://') || src.startsWith('https://')) return true
  return false
}

/**
 * For each <img> in filled HTML, if its src is broken/relative and the template
 * has an image at the same index, copy the template's img tag.
 */
export function restoreTemplateMedia(
  filledHtml: string,
  templateHtml: string
): string {
  const filled = filledHtml || ''
  const template = templateHtml || ''
  if (!filled || !template) return filled

  const templateImgs = template.match(IMG_TAG_RE) ?? []
  if (templateImgs.length === 0) return filled

  let index = 0
  return filled.replace(IMG_TAG_RE, (filledTag) => {
    const i = index
    index += 1
    if (i >= templateImgs.length) return filledTag
    if (isResolvableMediaSrc(imgSrc(filledTag))) return filledTag
    return templateImgs[i]
  })
}
