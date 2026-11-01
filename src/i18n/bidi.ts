import bidiModule, { type Bidi } from 'bidi-js'
import { readUserConfig } from '../core/config.ts'
import { nodditEnv } from '../core/env.ts'

/**
 * How right-to-left text reaches the terminal.
 * - `visual`: decs reorders each line itself (Unicode Bidirectional Algorithm),
 *   for terminals that draw strictly left to right.
 * - `terminal`: logical order, with embedded left-to-right runs wrapped in
 *   isolates, for terminals that apply the algorithm themselves.
 */
export type BidiMode = 'visual' | 'terminal'
export const BIDI_MODES: readonly BidiMode[] = ['visual', 'terminal']

// The typings describe an ES module; Node loads the package's CommonJS build.
const bidiFactory = (bidiModule as { default?: () => Bidi }).default ?? (bidiModule as unknown as () => Bidi)
const bidi = bidiFactory()

const LRI = '\u2066'
const PDI = '\u2069'
export const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
const LTR_CHAR = /[\p{L}\p{N}]/u

export function parseBidiMode(raw: unknown): BidiMode | undefined {
  return typeof raw === 'string' && (BIDI_MODES as readonly string[]).includes(raw) ? (raw as BidiMode) : undefined
}

/** `NODDIT_BIDI` (or the older `DECS_BIDI`), then `decs config bidi`, then `visual`. */
export function bidiMode(env: NodeJS.ProcessEnv = process.env): BidiMode {
  return parseBidiMode(nodditEnv('BIDI', env)) ?? parseBidiMode(readUserConfig().bidi) ?? 'visual'
}

export function hasRtl(s: string): boolean {
  return RTL_CHAR.test(s)
}

export interface StyledRun<T> {
  text: string
  style: T
}

/**
 * Reorders styled runs from logical to visual order on an RTL paragraph,
 * mirroring brackets inside right-to-left spans. Styles travel with their
 * characters. Lines without right-to-left characters come back unchanged,
 * unless `always` — a block that is part of a right-to-left row.
 */
export function reorderRuns<T>(runs: StyledRun<T>[], opts: { always?: boolean } = {}): StyledRun<T>[] {
  const chars: { ch: string; style: T }[] = []
  for (const r of runs) for (const ch of r.text) chars.push({ ch, style: r.style })
  const text = chars.map((c) => c.ch).join('')
  if (!opts.always && !hasRtl(text)) return runs
  // bidi-js works in UTF-16 units; map them back to code points.
  const unitToChar: number[] = []
  chars.forEach((c, i) => {
    for (let k = 0; k < c.ch.length; k++) unitToChar.push(i)
  })
  const levels = bidi.getEmbeddingLevels(text, 'rtl')
  const order = bidi.getReorderedIndices(text, levels)
  const out: StyledRun<T>[] = []
  let last = -1
  for (const unit of order) {
    const ci = unitToChar[unit]
    if (ci === last) continue
    last = ci
    const c = chars[ci]
    const ch = levels.levels[unit] & 1 ? (bidi.getMirroredCharacter(c.ch) ?? c.ch) : c.ch
    const tail = out[out.length - 1]
    if (tail && tail.style === c.style) tail.text += ch
    else out.push({ text: ch, style: c.style })
  }
  return out
}

/** One plain line in visual order. */
export function visualText(s: string): string {
  return reorderRuns([{ text: s, style: null }]).map((r) => r.text).join('')
}

/** Wraps each left-to-right run (refs, numbers, commands, English words) in LRI…PDI. */
export function isolateLtr(s: string): string {
  if (!hasRtl(s)) return s
  const chars = [...s]
  let out = ''
  let i = 0
  while (i < chars.length) {
    if (!LTR_CHAR.test(chars[i]) || RTL_CHAR.test(chars[i])) {
      out += chars[i++]
      continue
    }
    let end = i
    let j = i
    while (j < chars.length && !RTL_CHAR.test(chars[j])) {
      if (LTR_CHAR.test(chars[j])) end = j
      j++
    }
    out += LRI + chars.slice(i, end + 1).join('') + PDI
    i = end + 1
  }
  return out
}

const SGR = /\x1b\[[0-9;]*m/g

/**
 * One terminal line, ANSI colours included, made ready for an RTL terminal
 * line: leading indentation and a machine prefix (`DECS-IDLE …`, `since=…`)
 * stay where they are; the rest is reordered or isolated.
 */
export function bidiLine(line: string, mode: BidiMode, keep: RegExp = /^\s*/): string {
  const head = keep.exec(line)?.[0] ?? ''
  const rest = line.slice(head.length)
  if (!hasRtl(rest)) return line
  if (mode === 'terminal') return head + isolateLtr(rest)
  const runs: StyledRun<string>[] = []
  let style = ''
  let at = 0
  for (const m of rest.matchAll(SGR)) {
    if (m.index! > at) runs.push({ text: rest.slice(at, m.index), style })
    style = m[0] === '\x1b[0m' ? '' : style + m[0]
    at = m.index! + m[0].length
  }
  if (at < rest.length) runs.push({ text: rest.slice(at), style })
  const body = reorderRuns(runs)
    .map((r) => (r.style ? `${r.style}${r.text}\x1b[0m` : r.text))
    .join('')
  return head + body
}

/** Machine prefixes agents read: they stay first and left-to-right. */
export const MACHINE_PREFIX = /^\s*(?:DECS-[A-Z-]+\b[^\S\n]*|since=\S+[^\S\n]*)?/

/** Wraps a stream's `write` so every line it prints goes through `bidiLine`. */
export function installBidi(stream: NodeJS.WriteStream, mode: BidiMode): void {
  const write = stream.write.bind(stream) as (chunk: unknown, ...rest: unknown[]) => boolean
  stream.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (typeof chunk !== 'string') return write(chunk, ...rest)
    const text = chunk.split('\n').map((l) => bidiLine(l, mode, MACHINE_PREFIX)).join('\n')
    return write(text, ...rest)
  }) as typeof stream.write
}

/**
 * For an RTL language on a terminal: route stdout/stderr through `bidiLine`.
 * Pipes keep logical order (agents and scripts read them), and so do `--json`
 * and the bench (also a bare `decs`), which lays out its own frame.
 */
export function bidiOutput(argv: string[], rtl: boolean, mode: BidiMode = bidiMode()): void {
  if (!rtl || argv.includes('--json') || argv[0] === 'bench' || argv[0] === undefined) return
  for (const stream of [process.stdout, process.stderr]) if (stream.isTTY) installBidi(stream, mode)
}
