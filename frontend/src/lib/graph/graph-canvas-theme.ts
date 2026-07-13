'use client'

import { useEffect, useState } from 'react'
import { useThemeStore } from '@/lib/stores/theme-store'

export interface GraphCanvasTheme {
  /** Node/edge label fill — contrasts with canvas background. */
  label: string
  /** Label stroke/halo — matches canvas so text pops on busy edges. */
  halo: string
  /** Hover label chip fill. */
  hoverFill: string
  /** Dimmed (non-highlighted) node fill. */
  dimNode: string
  /** Dimmed (non-selected) edge stroke. */
  dimEdge: string
  isDark: boolean
}

const LIGHT: GraphCanvasTheme = {
  label: '#18181b',
  halo: '#ffffff',
  hoverFill: '#ffffff',
  dimNode: '#cbd5e1',
  dimEdge: '#e2e8f0',
  isDark: false,
}

const DARK: GraphCanvasTheme = {
  label: '#fafafa',
  halo: '#18181b',
  hoverFill: '#27272a',
  dimNode: '#475569',
  dimEdge: '#334155',
  isDark: true,
}

/**
 * Resolve graph text/chrome colors from CSS variables when possible,
 * falling back to explicit light/dark pairs for canvas (WebGL/2D) safety.
 */
export function readGraphCanvasTheme(
  root: HTMLElement = document.documentElement
): GraphCanvasTheme {
  const isDark = root.classList.contains('dark')
  const base = isDark ? DARK : LIGHT

  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;pointer-events:none;color:var(--foreground);background-color:var(--background)'
  root.appendChild(probe)
  try {
    const cs = getComputedStyle(probe)
    const label = cs.color
    const halo = cs.backgroundColor
    if (label && label !== 'rgba(0, 0, 0, 0)' && !label.includes('oklch')) {
      return {
        ...base,
        label,
        halo: halo && halo !== 'rgba(0, 0, 0, 0)' ? halo : base.halo,
        hoverFill: halo && halo !== 'rgba(0, 0, 0, 0)' ? halo : base.hoverFill,
        isDark,
      }
    }
  } finally {
    root.removeChild(probe)
  }

  return base
}

/**
 * Subscribe to theme class / store changes so Sigma can refresh label colors
 * without a full remount.
 */
export function useGraphCanvasTheme(): GraphCanvasTheme {
  const themePreference = useThemeStore((s) => s.theme)
  const [colors, setColors] = useState<GraphCanvasTheme>(() =>
    typeof document !== 'undefined' ? readGraphCanvasTheme() : LIGHT
  )

  useEffect(() => {
    const sync = () => setColors(readGraphCanvasTheme())
    sync()

    const root = document.documentElement
    const observer = new MutationObserver(sync)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMedia = () => {
      if (themePreference === 'system') sync()
    }
    media.addEventListener('change', onMedia)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', onMedia)
    }
  }, [themePreference])

  return colors
}
