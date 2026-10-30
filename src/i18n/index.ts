import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import i18next, { type i18n, type TOptions } from 'i18next'
import { readUserConfig, writeUserConfig } from '../core/config.ts'

export const LANGUAGES = ['en', 'zh-Hans', 'zh-Hant', 'fr', 'ar'] as const
export type Lang = (typeof LANGUAGES)[number]
export const DEFAULT_LANG: Lang = 'en'

/** Each language's own name, for `decs config lang` and the READMEs' switcher. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  fr: 'Français',
  ar: 'العربية',
}

export const LOCALES_DIR = fileURLToPath(new URL('./locales/', import.meta.url))

/**
 * Maps whatever a user or the OS says — `zh_TW.UTF-8`, `zh-HK`, `fr_CA`,
 * `ar-EG`, `zh-Hans`, `ZH` — to a supported language, or undefined.
 */
export function normalizeLang(raw: string | undefined): Lang | undefined {
  if (!raw) return undefined
  const code = raw.trim().split(/[.@]/)[0].replace(/_/g, '-').toLowerCase()
  if (!code || code === 'c' || code === 'posix') return undefined
  const [base, ...rest] = code.split('-')
  if (base === 'zh') {
    if (rest.includes('hant') || rest.some((r) => r === 'tw' || r === 'hk' || r === 'mo')) return 'zh-Hant'
    return 'zh-Hans'
  }
  if (base === 'en' || base === 'fr' || base === 'ar') return base
  return undefined
}

const IGNORED_LOCALES = /^(c|posix)([.@]|$)/i

/** The OS UI locale where no locale variables are set — plain Windows terminals (cmd, PowerShell). */
export function intlLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}

/**
 * LC_ALL, then LC_MESSAGES, then LANG (POSIX shells, Git Bash, WSL); C and
 * POSIX say nothing and are skipped. Without any of them, the OS locale as
 * Intl reports it. A locale decs has no translation for means English.
 */
export function systemLang(env: NodeJS.ProcessEnv = process.env, osLocale: () => string | undefined = intlLocale): Lang | undefined {
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const v = env[name]?.trim()
    if (v && !IGNORED_LOCALES.test(v)) return normalizeLang(v) ?? DEFAULT_LANG
  }
  const os = osLocale()
  return os ? (normalizeLang(os) ?? DEFAULT_LANG) : undefined
}

export function configuredLang(): Lang | undefined {
  const v = readUserConfig().lang
  return typeof v === 'string' ? normalizeLang(v) : undefined
}

export function writeConfiguredLang(lang: Lang | undefined): void {
  writeUserConfig({ lang })
}

export type LangSource = 'flag' | 'env' | 'config' | 'system' | 'default'

/** `--lang`, then `DECS_LANG`, then `decs config lang`, then the system locale, then English. */
export function resolveLangSource(
  opts: { flag?: string; env?: NodeJS.ProcessEnv; config?: () => Lang | undefined; osLocale?: () => string | undefined } = {},
): { lang: Lang; source: LangSource } {
  const env = opts.env ?? process.env
  const steps: [LangSource, () => Lang | undefined][] = [
    ['flag', () => normalizeLang(opts.flag)],
    ['env', () => normalizeLang(env.DECS_LANG)],
    ['config', opts.config ?? configuredLang],
    ['system', () => systemLang(env, opts.osLocale)],
  ]
  for (const [source, get] of steps) {
    const lang = get()
    if (lang) return { lang, source }
  }
  return { lang: DEFAULT_LANG, source: 'default' }
}

export function resolveLang(opts: Parameters<typeof resolveLangSource>[0] = {}): Lang {
  return resolveLangSource(opts).lang
}

/** Pulls `--lang <code>` / `--lang=<code>` out of argv (before any `--`). */
export function takeLangFlag(argv: string[]): { argv: string[]; lang?: string } {
  const out: string[] = []
  let lang: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok === '--') {
      out.push(...argv.slice(i))
      break
    }
    if (tok === '--lang') {
      lang = argv[++i] ?? ''
      continue
    }
    if (tok.startsWith('--lang=')) {
      lang = tok.slice('--lang='.length)
      continue
    }
    out.push(tok)
  }
  return { argv: out, lang }
}

/** One language's resources: every `locales/<lng>/<area>.json`, keyed by area. */
export function loadResources(lng: Lang): Record<string, unknown> {
  const dir = join(LOCALES_DIR, lng)
  const out: Record<string, unknown> = {}
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    out[basename(f, '.json')] = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  }
  return out
}

let instance: i18n | undefined
let current: Lang | undefined
let flagValue: string | undefined

/** What `--lang` said on this command line, so `decs config lang` can report it. */
export function langFlag(): string | undefined {
  return flagValue
}

/** Picks the language for this process from the command line's `--lang` and the usual order. */
export function initLang(flag?: string): Lang {
  flagValue = flag
  setLang(resolveLang({ flag }))
  return current!
}

export function setLang(lng: Lang): void {
  const resources: Record<string, { translation: Record<string, unknown> }> = { [lng]: { translation: loadResources(lng) } }
  if (lng !== DEFAULT_LANG) resources[DEFAULT_LANG] = { translation: loadResources(DEFAULT_LANG) }
  const next = i18next.createInstance()
  void next.init({
    lng,
    fallbackLng: DEFAULT_LANG,
    resources,
    initAsync: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    // A placeholder nobody filled in prints as {{name}}; the test suite makes that an error.
    missingInterpolationHandler: (_text: string, match: RegExpMatchArray) => {
      if (process.env.DECS_STRICT_I18N) throw new Error(`missing value for ${match[0]}`)
      return ''
    },
    returnNull: false,
  })
  instance = next
  current = lng
}

export function lang(): Lang {
  if (!current) setLang(resolveLang())
  return current!
}

export function isRtl(lng: Lang = lang()): boolean {
  return lng === 'ar'
}

export function t(key: string, opts?: TOptions): string {
  if (!instance) lang()
  return instance!.t(key, opts) as string
}

/** A list joined the way the current language joins it: `a、b` / `a, b` / `a، b`. */
export function list(items: string[]): string {
  return items.join(t('common.listSeparator'))
}
