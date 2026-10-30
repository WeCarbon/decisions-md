import { bool, type Args } from '../args.ts'
import { resolveStore } from '../context.ts'
import { findLayout } from '../../core/paths.ts'
import { DEFAULT_LETTER, configPath, readProjectConfig, writeProjectConfig } from '../../core/project.ts'
import { CONFIG_PATH } from '../../core/config.ts'
import { dim } from '../../core/render.ts'
import { SETTINGS, settingFor, settingValue, setSetting, showValue, type Setting } from '../../core/settings.ts'
import { LANGUAGES, LANGUAGE_NAMES, langFlag, resolveLangSource, t } from '../../i18n/index.ts'

const help = () =>
  t('cli.config.help', {
    defaultLetter: DEFAULT_LETTER,
    languages: LANGUAGES.map((l) => `${l} (${LANGUAGE_NAMES[l]})`).join(', '),
    settings: SETTINGS.map((s) => `  ${s.key.padEnd(17)}${s.values.join(' | ')}${s.env ? `   (${s.env})` : ''}`).join('\n'),
  })

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const [key, value] = args._
  if (!key) return list()
  if (key === 'letter') return letter(args, value)
  const setting = settingFor(key)
  if (!setting) throw new Error(`${t('cli.config.unknownKey', { key, keys: ['letter', ...SETTINGS.map((s) => s.key)].join(' ') })}\n\n${help()}`)
  if (bool(args, 'off')) {
    setSetting(key, undefined)
    console.log(t('cli.config.cleared', { key, path: dim(CONFIG_PATH) }))
    return 0
  }
  if (value === undefined) {
    console.log(current(setting))
    return 0
  }
  const stored = setSetting(key, value) ?? setting.default
  if (key === 'lang' && stored !== 'auto') {
    console.log(t('common.lang.set', { name: showValue(setting, stored), code: stored, path: dim(CONFIG_PATH) }))
  } else {
    console.log(t('cli.config.set', { key, value: showValue(setting, stored), path: dim(CONFIG_PATH) }))
  }
  return 0
}

/** One setting's value and where it comes from: `Français (fr), from decs config lang`. */
function current(s: Setting): string {
  if (s.key === 'lang') {
    const { lang, source } = resolveLangSource({ flag: langFlag() })
    return t('common.lang.current', { name: LANGUAGE_NAMES[lang], code: lang, source: t(`common.lang.source.${source}`) })
  }
  const { value, source } = settingValue(s.key)
  const from = source === 'env' ? s.env! : source === 'config' ? `decs config ${s.key}` : t('common.lang.source.default')
  return t('cli.config.current', { value: showValue(s, value), source: from })
}

/** `decs config`: every setting, then this project's letter when there is a project here. */
function list(): number {
  const width = Math.max(...SETTINGS.map((s) => s.key.length)) + 2
  for (const s of SETTINGS) console.log(`${s.key.padEnd(width)}${current(s)}`)
  console.log(dim(CONFIG_PATH))
  const layout = findLayout()
  if (layout) {
    console.log(`\n${'letter'.padEnd(width)}${readProjectConfig(layout).letter ?? t('cli.config.letterUnset', { letter: DEFAULT_LETTER })}`)
    console.log(dim(configPath(layout)))
  }
  return 0
}

/** The project letter belongs to the repo you are standing in, not to the user. */
function letter(args: Args, value: string | undefined): number {
  const layout = resolveStore(args).primary
  if (!value) {
    console.log(readProjectConfig(layout).letter ?? t('cli.config.letterUnset', { letter: DEFAULT_LETTER }))
    return 0
  }
  const next = writeProjectConfig(layout, { letter: value.toUpperCase() })
  console.log(`${t('cli.config.letterSet', { letter: next.letter })}  ${dim(configPath(layout))}`)
  return 0
}
