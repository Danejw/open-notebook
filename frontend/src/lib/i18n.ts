import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { resources } from './locales'
import { loadLocale, preloadLocale } from './locales/load-locale'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

if (typeof window !== 'undefined') {
  const detected = i18n.language || i18n.resolvedLanguage || 'en-US'
  if (detected !== 'en-US') {
    preloadLocale(detected)
  }
  i18n.on('languageChanged', (lng) => {
    void loadLocale(lng)
  })
}

export default i18n
