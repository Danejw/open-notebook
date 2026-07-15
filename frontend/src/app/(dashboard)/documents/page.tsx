'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Legacy /documents library route → Templates library. */
export default function DocumentsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/templates')
  }, [router])
  return null
}
