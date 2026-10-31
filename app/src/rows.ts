import type { Bench, Row, View } from './types.ts'

/** What the reader has folded or unfolded, on top of what decs says the default is. */
export interface Folds {
  /** node key → collapsed? */
  nodes: Record<string, boolean>
  /** fold row key → open? */
  groups: Record<string, boolean>
}

export const isSelectable = (r: Row) => r.kind === 'node' || r.kind === 'fold'

export const nodeCollapsed = (r: Row, folds: Folds) => Boolean(r.has_kids) && (folds.nodes[r.key] ?? Boolean(r.collapsed))

/** The rows on screen: closed fold rows and collapsed nodes hide what is listed under them. */
export function visibleRows(view: View, folds: Folds): Row[] {
  const parentFold = new Map<string, string | null>()
  for (const r of view.rows) if (r.kind === 'fold') parentFold.set(r.key, r.fold)
  const open = (key: string | null): boolean => {
    for (let k = key; k; k = parentFold.get(k) ?? null) if (!folds.groups[k]) return false
    return true
  }
  const out: Row[] = []
  let hideBelow: number | null = null
  for (const r of view.rows) {
    if (hideBelow !== null) {
      if (r.kind !== 'header' && r.depth > hideBelow) continue
      hideBelow = null
    }
    if (!open(r.fold)) continue
    out.push(r)
    if (r.kind === 'node' && nodeCollapsed(r, folds)) hideBelow = r.depth
  }
  return out
}

/** How many rows a collapsed node hides, for its 「+N」. */
export function hiddenCount(view: View, index: number): number {
  const r = view.rows[index]
  let n = 0
  for (let i = index + 1; i < view.rows.length; i++) {
    const x = view.rows[i]
    if (x.kind === 'header' || x.depth <= r.depth) break
    if (x.kind === 'node') n++
  }
  return n
}

/** Where `nodeKey` sits in `view`, and what has to open for it to show. */
export function reveal(bench: Bench, view: View, nodeKey: string, folds: Folds): Folds | null {
  const at = view.rows.findIndex((r) => r.kind === 'node' && r.key === nodeKey)
  if (at === -1) return null
  const next: Folds = { nodes: { ...folds.nodes }, groups: { ...folds.groups } }
  const parentFold = new Map(view.rows.filter((r) => r.kind === 'fold').map((r) => [r.key, r.fold]))
  for (let k = view.rows[at].fold; k; k = parentFold.get(k) ?? null) next.groups[k] = true
  const node = bench.nodes[nodeKey]
  for (let p = node?.parent; p != null; ) {
    const key = `${node.project}#${p}`
    next.nodes[key] = false
    const row = view.rows.find((r) => r.key === key)
    for (let k = row?.fold ?? null; k; k = parentFold.get(k) ?? null) next.groups[k] = true
    p = bench.nodes[key]?.parent ?? null
  }
  return next
}
