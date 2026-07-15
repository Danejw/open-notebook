'use client'

import { useEffect, useState } from 'react'
import { mediaApi } from '@/lib/api/media'
import { cn } from '@/lib/utils'

type MediaThumbnailProps = {
  mediaId: string
  alt: string
  className?: string
}

/**
 * Loads a media library image with auth and displays it via a blob URL.
 */
export function MediaThumbnail({ mediaId, alt, className }: MediaThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    void mediaApi
      .fetchFileBlob(mediaId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaId])

  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-[10px] text-muted-foreground',
          className
        )}
        aria-label={alt}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob URL from authenticated fetch
    <img src={src} alt={alt} className={cn('object-contain', className)} />
  )
}
