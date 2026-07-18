'use client'

import { useState, useEffect } from 'react'

function getInitialMatch(query: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia(query).matches
}

/**
 * Hook to detect if viewport matches a media query.
 * Initializes from window on first client render to avoid desktop layout flash.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getInitialMatch(query))

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Returns true if viewport is < 768px (below Tailwind's 'md' breakpoint)
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}

/**
 * Returns true if viewport is >= 768px and < 1024px (Tailwind 'md' through below 'lg')
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
}

/**
 * Returns true if viewport is >= 1024px (Tailwind's 'lg' breakpoint)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
