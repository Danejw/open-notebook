'use client'

import React from 'react'
import '@/lib/i18n'
import { LanguageLoadingOverlay } from '@/components/common/LanguageLoadingOverlay'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LanguageLoadingOverlay />
      {children}
    </>
  )
}
