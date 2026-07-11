import { enUS } from './en-US';

/** Only en-US is bundled at startup; other locales load on demand via load-locale.ts */
export const resources = {
  'en-US': { translation: enUS },
} as const;

export type TranslationKeys = typeof enUS;

export type LanguageCode =
  | 'en-US'
  | 'zh-CN'
  | 'zh-TW'
  | 'pt-BR'
  | 'ja-JP'
  | 'it-IT'
  | 'fr-FR'
  | 'ru-RU'
  | 'bn-IN'
  | 'ca-ES'
  | 'es-ES'
  | 'de-DE'
  | 'pl-PL'
  | 'tr-TR';

export type Language = {
  code: LanguageCode;
  label: string;
};

export const languages: Language[] = [
  { code: 'en-US', label: 'English' },
  { code: 'tr-TR', label: 'Türkçe' },
  { code: 'ca-ES', label: 'Català' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'es-ES', label: 'Español' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'pl-PL', label: 'Polski' },
];

export { enUS };
