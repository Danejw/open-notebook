'use client'

import { useEffect, useState } from 'react'
import { drawingExtractionApi } from '@/lib/api/drawing-extraction'

export function useAuthenticatedPageImage(
  runId: string | null | undefined,
  pageId: string | null
): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    if (!runId || !pageId) {
      setUrl(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setUrl(null)

    void drawingExtractionApi
      .fetchPageImage(runId, pageId, 'render')
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [runId, pageId])

  return { url, loading }
}
