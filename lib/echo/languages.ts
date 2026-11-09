// The language Echo talks in. Only Echo's words change; the app's menus stay in English.
// The codes match the list in firestore.rules (validProfile); change both together.

export const LANGUAGES = [
  { code: 'en', label: 'English', promptName: 'English' },
  { code: 'fil', label: 'Filipino (Tagalog)', promptName: 'Filipino (Tagalog)' },
  { code: 'taglish', label: 'Taglish', promptName: 'Taglish (natural Tagalog-English mix, as Filipinos text)' },
  { code: 'ceb', label: 'Cebuano (Bisaya)', promptName: 'Cebuano (Bisaya)' },
  { code: 'ilo', label: 'Ilocano', promptName: 'Ilocano' },
  { code: 'hil', label: 'Hiligaynon (Ilonggo)', promptName: 'Hiligaynon (Ilonggo)' },
  { code: 'es', label: 'Español', promptName: 'Spanish' },
  { code: 'zh', label: '中文 (Mandarin)', promptName: 'Mandarin Chinese' },
  { code: 'hi', label: 'हिन्दी (Hindi)', promptName: 'Hindi' },
  { code: 'ar', label: 'العربية (Arabic)', promptName: 'Arabic' },
  { code: 'pt', label: 'Português', promptName: 'Portuguese' },
  { code: 'fr', label: 'Français', promptName: 'French' },
  { code: 'ja', label: '日本語', promptName: 'Japanese' },
  { code: 'ko', label: '한국어', promptName: 'Korean' },
  { code: 'id', label: 'Bahasa Indonesia', promptName: 'Indonesian (Bahasa Indonesia)' },
  { code: 'vi', label: 'Tiếng Việt', promptName: 'Vietnamese' },
  { code: 'de', label: 'Deutsch', promptName: 'German' },
] as const satisfies readonly { code: string; label: string; promptName: string }[]

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

/** The stored value if it is a known code, else English. */
export function languageCode(v: unknown): LanguageCode {
  return LANGUAGES.find((l) => l.code === v)?.code ?? DEFAULT_LANGUAGE
}

/** The language's English name, for the model to read. */
export function languagePromptName(code: LanguageCode): string {
  return (LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]).promptName
}
