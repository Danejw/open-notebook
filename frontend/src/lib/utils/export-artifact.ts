import { triggerBlobDownload } from '@/lib/utils/blob-download'

export function normalizeArtifactId(artifactId: string): string {
  return artifactId.includes(':') ? artifactId : `note:${artifactId}`
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

export function downloadArtifactMarkdown(title: string, content: string) {
  const filename = `${sanitizeExportFilename(title || 'artifact')}.md`
  const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' })
  triggerBlobDownload(blob, filename)
}
