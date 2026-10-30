import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from './lock.ts'
import type { Layout } from './paths.ts'
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
  const letter = (raw as Record<string, unknown>).letter
  if (letter !== undefined && (typeof letter !== 'string' || !LETTER_RE.test(letter)))
    return [`decs.json letter must be one A–Z letter, got ${JSON.stringify(letter)}`]
  return []
}

/** Never throws: a broken config falls back to defaults and `decs check` says why. */
export function readProjectConfig(l: Layout): ProjectConfig {
  try {
    const raw = JSON.parse(readFileSync(configPath(l), 'utf8')) as Record<string, unknown>
    const letter = typeof raw.letter === 'string' && LETTER_RE.test(raw.letter) ? raw.letter : undefined
    return { ...raw, letter }
  } catch {
    return {}
  }
}

export function writeProjectConfig(l: Layout, patch: ProjectConfig): ProjectConfig {
  if (patch.letter !== undefined && !LETTER_RE.test(patch.letter))
    throw new Error(t('core.project.badLetter', { letter: patch.letter }))
  const next = { ...readProjectConfig(l), ...patch }
  writeFileAtomic(configPath(l), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export function projectLetter(l: Layout): string {
  return readProjectConfig(l).letter ?? DEFAULT_LETTER
}
