import { ar } from './locales/ar.ts'
import { en, type Strings } from './locales/en.ts'
import { fr } from './locales/fr.ts'
import { zhHans } from './locales/zh-Hans.ts'
import { zhHant } from './locales/zh-Hant.ts'

/**
 * The window's own words. Everything about nodes (view names, statuses,
 * badges, note headings) arrives already translated from `decs bench --json`;
 * these are only the frame around it, in the same language decs speaks.
 */
export type StringKey = keyof Strings

const TABLES: Record<string, Strings> = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, fr, ar }
let table: Strings = en

export function setLanguage(lang: string, rtl = false): void {
  table = TABLES[lang] ?? en
  document.documentElement.lang = lang
  document.documentElement.dir = rtl ? 'rtl' : 'ltr'
}

export function s(key: StringKey, vars: Record<string, string | number> = {}): string {
  return (table[key] ?? en[key]).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''))
}
