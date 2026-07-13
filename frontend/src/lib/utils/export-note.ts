export function normalizeNoteId(noteId: string): string {
  return noteId.includes(':') ? noteId : `note:${noteId}`
}

export function sanitizeExportFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, 80) || 'artifact'
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(blobUrl)
}

export function downloadNoteMarkdown(title: string, content: string) {
  const filename = `${sanitizeExportFilename(title || 'artifact')}.md`
  const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' })
  triggerBlobDownload(blob, filename)
}
