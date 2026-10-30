import stringWidthLib from 'string-width'

/** Display columns, counting CJK and emoji as two. */
export function stringWidth(s: string): number {
  return stringWidthLib(s)
}

export function padToWidth(s: string, width: number): string {
  const pad = width - stringWidth(s)
  return pad > 0 ? s + ' '.repeat(pad) : s
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** What the eye sees as one character; walking code points instead would
 *  split `🖼️` into two and measure one column short. */
export function graphemes(s: string): string[] {
  return Array.from(segmenter.segment(s), (g) => g.segment)
}

/** Truncates on display width, not character count, and marks the cut —
 *  at the end for left-to-right text, at the start (the logical end, for a
 *  right-to-left reader) when `rtl` is set, same kept prefix either way. */
export function fit(s: string, width: number, rtl = false): string {
  if (width <= 0) return ''
  if (stringWidth(s) <= width) return s
  let out = ''
  let used = 0
  for (const ch of graphemes(s)) {
    const w = stringWidth(ch)
    if (used + w > width - 1) break
    out += ch
    used += w
  }
  return rtl ? `…${out}` : `${out}…`
}

/** Hard-wraps one logical line to `width` columns: ASCII breaks on spaces,
 *  CJK may break anywhere. Never splits a surrogate pair. */
export function wrapToWidth(line: string, width: number): string[] {
  if (width <= 0) return [line]
  const out: string[] = []
  let cur = ''
  let used = 0
  let lastBreak = -1

  for (const ch of graphemes(line)) {
    const w = stringWidth(ch)
    if (used + w > width) {
      // Retreat to the last space only for a narrow (mid-word) overflow; a
      // wide char may start its own line.
      const retreat = w === 1 && lastBreak > 0 && used - lastBreak < width * 0.4
      if (retreat) {
        out.push(cur.slice(0, lastBreak).trimEnd())
        cur = cur.slice(lastBreak).trimStart()
        used = stringWidth(cur)
      } else {
        out.push(cur)
        cur = ''
        used = 0
      }
      lastBreak = -1
      // Don't start the continuation line with the space we broke on.
      if (ch === ' ') continue
    }
    cur += ch
    used += w
    if (ch === ' ') lastBreak = cur.length
  }
  if (cur) out.push(cur)
  return out.length ? out : ['']
}
