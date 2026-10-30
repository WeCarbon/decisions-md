import { DEFAULT_LETTER } from './project.ts'
import { t } from '../i18n/index.ts'

/**
 * How a node is named on screen: project letter + number (`X305` when the
 * project has no letter). One id space per project — tasks and decisions
 * are the same thing — so there's no type letter. Display/parsing only;
 * files on disk keep their existing names.
 */
export function formatRef(id: number, letter?: string): string {
  return `${letter || DEFAULT_LETTER}${id}`
}

/** The ref of a loaded node. `letter` is filled in by the Store at load time. */
export function refOf(d: { id: number; letter?: string }): string {
  return formatRef(d.id, d.letter)
}

export interface ParsedRef {
  id: number
  /** The letter in front of the number, if any; `D` is also the legacy
   *  form — see Store.resolve for which wins when a project is lettered D. */
  letter?: string
  /** Project name, from the `web:305` form. */
  project?: string
}

/**
 * Accepted forms: `305  W305  w305  D305  W:305  web:305  web:D305`.
 * Before a colon, a single capital letter is a project letter; anything
 * longer is a project name.
 */
export function parseRef(raw: string): ParsedRef {
  const s = raw.trim()
  const colon = s.lastIndexOf(':')
  const head = colon === -1 ? undefined : s.slice(0, colon)
  const tail = colon === -1 ? s : s.slice(colon + 1)

  const m = /^([A-Za-z])?(\d+)$/.exec(tail)
  if (!m) throw new Error(t('core.ref.notANodeNumber', { raw }))
  const out: ParsedRef = { id: Number(m[2]) }
  const letter = m[1]?.toUpperCase()
  if (head !== undefined && /^[A-Z]$/.test(head)) {
    if (letter && letter !== 'D' && letter !== head) throw new Error(t('core.ref.twoLetters', { raw }))
    out.letter = head
  } else if (head) {
    out.project = head
    // `web:D305` — the D is the legacy prefix, the name already says where.
    if (letter && letter !== 'D') throw new Error(t('core.ref.nameAndLetter', { raw }))
  } else if (letter) {
    out.letter = letter
  }
  return out
}

/**
 * Refs mentioned in prose: `D296` (legacy) is this project (or the one
 * lettered D); `W305` is the project lettered W. Whole tokens only
 * (`ID301`, `D3011x` don't count), and a letter needs ≥2 digits, since `F1`,
 * `T3`, `Q2` etc. are common sub-item labels that would otherwise all
 * become links.
 */
export function parseBodyRefs(text: string, knownLetters: Iterable<string> = []): ParsedRef[] {
  const letters = new Set(knownLetters)
  const out: ParsedRef[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/(?<![A-Za-z0-9_])([A-Z])(\d{1,6})(?![A-Za-z0-9_])/g)) {
    const [, letter, num] = m
    const legacy = letter === 'D'
    if (!legacy && (!letters.has(letter) || num.length < 2)) continue
    const key = `${letter}${num}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: Number(num), letter })
  }
  return out
}
