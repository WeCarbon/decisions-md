import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { writeFileAtomic } from './lock.ts'
import { listEntryFiles, type Layout } from './paths.ts'
import { t } from '../i18n/index.ts'

/**
 * `decisions/decs.json` — per-project settings that travel with the repo.
 *
 * Kept tiny on purpose. It is committed alongside the entries, so every lane
 * and every machine sees the same letter without any registry.
 */
export interface ProjectConfig {
  /** One A–Z letter that prefixes this project's refs: `W` → `W305`. */
  letter?: string
  /** Letters this project used before, newest last; refs written with them still resolve. */
  former_letters?: string[]
  /** What the bench and the window call the project; the folder name when absent. */
  name?: string
}

/** What a project without a letter is shown as. Deliberately not a real-looking one. */
export const DEFAULT_LETTER = 'X'
const LETTER_RE = /^[A-Z]$/

export const configPath = (l: Layout) => join(l.root, 'decs.json')

/** Problems with the file, for `decs check`. Empty when it is fine or absent. */
export function configProblems(l: Layout): string[] {
  const p = configPath(l)
  if (!existsSync(p)) return []
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    return [`decs.json is not valid JSON: ${(e as Error).message}`]
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['decs.json must be a JSON object']
  const o = raw as Record<string, unknown>
  const letter = o.letter
  if (letter !== undefined && (typeof letter !== 'string' || !LETTER_RE.test(letter)))
    return [`decs.json letter must be one A–Z letter, got ${JSON.stringify(letter)}`]
  if (o.name !== undefined && (typeof o.name !== 'string' || !o.name.trim())) return ['decs.json name must be a non-empty string']
  if (o.former_letters !== undefined && !(Array.isArray(o.former_letters) && o.former_letters.every((x) => typeof x === 'string' && LETTER_RE.test(x))))
    return ['decs.json former_letters must be a list of A–Z letters']
  return []
}

/** Never throws: a broken config falls back to defaults and `decs check` says why. */
export function readProjectConfig(l: Layout): ProjectConfig {
  try {
    const raw = JSON.parse(readFileSync(configPath(l), 'utf8')) as Record<string, unknown>
    const letter = typeof raw.letter === 'string' && LETTER_RE.test(raw.letter) ? raw.letter : undefined
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined
    const former = Array.isArray(raw.former_letters) ? raw.former_letters.filter((x): x is string => typeof x === 'string' && LETTER_RE.test(x)) : undefined
    return { ...raw, letter, name, former_letters: former?.length ? former : undefined }
  } catch {
    return {}
  }
}

/** `null` in the patch removes a key. Changing the letter remembers the old one in `former_letters`. */
export function writeProjectConfig(l: Layout, patch: { [K in keyof ProjectConfig]?: ProjectConfig[K] | null }): ProjectConfig {
  if (typeof patch.letter === 'string' && !LETTER_RE.test(patch.letter))
    throw new Error(t('core.project.badLetter', { letter: patch.letter }))
  const before = readProjectConfig(l)
  const next: Record<string, unknown> = { ...before, ...patch }
  // Only a letter that refs were ever written with is worth remembering: a project with no nodes has none.
  const oldLetter = listEntryFiles(l).length ? (before.letter ?? DEFAULT_LETTER) : undefined
  if (typeof patch.letter === 'string' && oldLetter && oldLetter !== patch.letter) {
    const former = (before.former_letters ?? []).filter((x) => x !== oldLetter && x !== patch.letter)
    next.former_letters = [...former, oldLetter]
  } else if (typeof patch.letter === 'string') {
    next.former_letters = before.former_letters?.filter((x) => x !== patch.letter)
  }
  for (const [k, v] of Object.entries(next)) if (v === null || v === undefined || (Array.isArray(v) && !v.length)) delete next[k]
  writeFileAtomic(configPath(l), `${JSON.stringify(next, null, 2)}\n`)
  return readProjectConfig(l)
}

export function projectLetter(l: Layout): string {
  return readProjectConfig(l).letter ?? DEFAULT_LETTER
}

/** `decs config name`, else the folder name. */
export function projectDisplayName(l: Layout): string {
  return readProjectConfig(l).name ?? basename(l.projectRoot)
}
