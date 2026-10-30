import { OPTIONS_HEADING_RE, parseOptions } from './parse.ts'

const H2 = /^##[ \t]+\S/

export interface DuplicateOptionsBlock {
  /** 1-based, inclusive: the lines `collapseDuplicateOptions` drops. */
  fromLine: number
  toLine: number
  /** The heading of the block it repeats, and of the repeat. */
  keeps: string
  drops: string
}

interface Block {
  start: number
  end: number // exclusive
  round: number
  heading: string
}

function blocks(lines: string[]): Block[] {
  const out: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = OPTIONS_HEADING_RE.exec(lines[i])
    if (!m) continue
    let end = i + 1
    while (end < lines.length && !H2.test(lines[end])) end++
    out.push({ start: i, end, round: Number(m[1] ?? 1), heading: lines[i] })
  }
  return out
}

/**
 * The block `decs ask` used to append after a text that already carried
 * its own `## 选项`: same keys/labels, every body empty. Only that exact
 * shape counts — a deliberate re-ask with no prose anywhere is left alone.
 */
export function findDuplicateOptions(body: string): DuplicateOptionsBlock | null {
  const lines = body.split('\n')
  const bs = blocks(lines)
  for (let i = bs.length - 1; i > 0; i--) {
    const cur = bs[i]
    const prev = bs[i - 1]
    if (cur.round !== prev.round && cur.round !== prev.round + 1) continue
    const a = parseOptions(lines.slice(prev.start, prev.end).join('\n'))
    const b = parseOptions(lines.slice(cur.start, cur.end).join('\n'))
    const same = a.length > 0 && a.length === b.length && a.every((o, k) => o.key === b[k].key && o.label === b[k].label)
    if (same && b.every((o) => !o.body.trim()) && a.some((o) => o.body.trim())) {
      // Take the blank lines before the block with it, so no gap is left.
      let from = cur.start
      while (from > 0 && !lines[from - 1].trim()) from--
      return { fromLine: from + 1, toLine: cur.end, keeps: prev.heading, drops: cur.heading }
    }
  }
  return null
}

/** The body with every such duplicate removed (there is usually one). */
export function collapseDuplicateOptions(body: string): { body: string; removed: DuplicateOptionsBlock[] } {
  const removed: DuplicateOptionsBlock[] = []
  let cur = body
  for (let dup = findDuplicateOptions(cur); dup; dup = findDuplicateOptions(cur)) {
    const lines = cur.split('\n')
    const rest = lines.slice(dup.toLine)
    cur = [...lines.slice(0, dup.fromLine - 1), ...(rest.length && rest[0].trim() ? [''] : []), ...rest].join('\n')
    removed.push(dup)
  }
  return { body: cur, removed }
}
