import { mediaApi } from '@/lib/api/media'
import type { MediaAsset } from '@/lib/types/media'

const IMAGE_TOKEN_RE = /\{\{\s*image\s*:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*\}\}/gi
const MEDIA_SRC_RE =
  /src\s*=\s*["']((?:https?:\/\/[^"'/]+)?\/api\/media\/([^/"']+)\/file)["']/gi

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Expand {{image:slug}} tokens and inline authenticated media files as data URLs
 * so sandboxed iframes can display logos without Bearer headers on <img> requests.
 */
export async function resolveMediaInHtml(
  html: string,
  assets?: MediaAsset[]
): Promise<string> {
  if (!html) return html

  let result = html
  const list = assets ?? (await mediaApi.list())
  const bySlug = new Map(list.map((a) => [a.slug.toLowerCase(), a]))

  result = result.replace(IMAGE_TOKEN_RE, (_match, slug: string) => {
    const asset = bySlug.get(String(slug).toLowerCase())
    if (!asset) {
      return `<img src="" alt="Missing image: ${slug}" data-media-slug="${slug}" data-media-missing="true" />`
    }
    return `<img src="${asset.file_url}" alt="${asset.name.replace(/"/g, '&quot;')}" data-media-slug="${asset.slug}" />`
  })

  const ids = new Set<string>()
  for (const match of result.matchAll(MEDIA_SRC_RE)) {
    if (match[2]) ids.add(match[2])
  }

  const dataUrls = new Map<string, string>()
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const blob = await mediaApi.fetchFileBlob(id)
        dataUrls.set(id, await blobToDataUrl(blob))
      } catch {
        // Leave original src; preview may show broken image
      }
    })
  )

  return result.replace(MEDIA_SRC_RE, (full, _url: string, id: string) => {
    const dataUrl = dataUrls.get(id)
    if (!dataUrl) return full
    return `src="${dataUrl}"`
  })
}

/** Build img markup stored in html_body (stable API path, not a data URL). */
export function mediaImgMarkup(asset: MediaAsset): string {
  const alt = asset.name.replace(/"/g, '&quot;')
  return `<img src="${asset.file_url}" alt="${alt}" data-media-slug="${asset.slug}" />`
}

/** Build a reusable token for Code view / templates. */
export function mediaToken(asset: MediaAsset): string {
  return `{{image:${asset.slug}}}`
}
