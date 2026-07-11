'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { OverlayPanelSkeleton } from '@/components/common/LoadingSkeletons'
import {
  i18nEvents,
  I18N_LANGUAGE_CHANGE_END,
  I18N_LANGUAGE_CHANGE_START,
} from '@/lib/i18n-events'

/**
 * LanguageLoadingOverlay - Shows a brief loading overlay during language switches
 * to provide a smoother UX and hide the flash caused by re-rendering.
 * 
 * IMPORTANT: This component intentionally uses react-i18next directly instead of
 * our custom useTranslation hook to avoid Proxy-related issues during the
 * language change transition period.
 */
export function LanguageLoadingOverlay() {
  const [isChanging, setIsChanging] = useState(false)

  const isChangingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLanguageChanging = useCallback(() => {
    if (!isChangingRef.current) {
      isChangingRef.current = true
      setIsChanging(true)
    }

    // Safety timeout: ensure we don't get stuck forever.
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        isChangingRef.current = false
        setIsChanging(false)
        timerRef.current = null
      }, 1500)
    }
  }, [])

  const handleLanguageChanged = useCallback(() => {
    // Immediately hide the overlay on language change success
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (isChangingRef.current) {
      isChangingRef.current = false
      setIsChanging(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    const onChangeStart = () => handleLanguageChanging()
    const onChangeEnd = () => handleLanguageChanged()

    i18nEvents.addEventListener(I18N_LANGUAGE_CHANGE_START, onChangeStart)
    i18nEvents.addEventListener(I18N_LANGUAGE_CHANGE_END, onChangeEnd)

    return () => {
      i18nEvents.removeEventListener(I18N_LANGUAGE_CHANGE_START, onChangeStart)
      i18nEvents.removeEventListener(I18N_LANGUAGE_CHANGE_END, onChangeEnd)
    }
  }, [handleLanguageChanging, handleLanguageChanged])

  if (!isChanging) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-200"
      style={{ opacity: isChanging ? 1 : 0 }}
    >
      <OverlayPanelSkeleton />
    </div>
  )
}
