import type { LanguageCode } from './index'

type LocaleModule = { translation: Record<string, unknown> }

const localeLoaders: Record<LanguageCode, () => Promise<LocaleModule>> = {
  'en-US': () => import('./en-US').then((m) => ({ translation: m.enUS })),
  'zh-CN': () => import('./zh-CN').then((m) => ({ translation: m.zhCN })),
  'zh-TW': () => import('./zh-TW').then((m) => ({ translation: m.zhTW })),
  'pt-BR': () => import('./pt-BR').then((m) => ({ translation: m.ptBR })),
  'ja-JP': () => import('./ja-JP').then((m) => ({ translation: m.jaJP })),
  'it-IT': () => import('./it-IT').then((m) => ({ translation: m.itIT })),
  'fr-FR': () => import('./fr-FR').then((m) => ({ translation: m.frFR })),
  'ru-RU': () => import('./ru-RU').then((m) => ({ translation: m.ruRU })),
  'bn-IN': () => import('./bn-IN').then((m) => ({ translation: m.bnIN })),
  'ca-ES': () => import('./ca-ES').then((m) => ({ translation: m.caES })),
  'es-ES': () => import('./es-ES').then((m) => ({ translation: m.esES })),
  'de-DE': () => import('./de-DE').then((m) => ({ translation: m.deDE })),
  'pl-PL': () => import('./pl-PL').then((m) => ({ translation: m.plPL })),
  'tr-TR': () => import('./tr-TR').then((m) => ({ translation: m.trTR })),
}

const loadedLocales = new Set<string>(['en-US'])

export async function loadLocale(language: string): Promise<void> {
  const code = language as LanguageCode
  if (!localeLoaders[code] || loadedLocales.has(code)) {
    return
  }

  const i18n = (await import('@/lib/i18n')).default
  const bundle = await localeLoaders[code]()
  i18n.addResourceBundle(code, 'translation', bundle.translation, true, true)
  loadedLocales.add(code)
}

/** Preload detected language after first paint (non-blocking). */
export function preloadLocale(language: string): void {
  if (typeof window === 'undefined' || language === 'en-US') {
    return
  }
  const run = () => {
    void loadLocale(language)
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run)
  } else {
    setTimeout(run, 0)
  }
}
