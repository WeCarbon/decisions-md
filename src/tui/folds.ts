import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { nodditEnv } from '../core/env.ts'
import { writeFileAtomic } from '../core/lock.ts'
import { isTerminal } from '../core/status.ts'
import type { Decision } from '../core/types.ts'
import { DEFERRED_GROUP, doneGroupKey, keyOf } from './views.ts'

/**
 * Which tree nodes the owner folded, remembered across bench sessions in
 * `$NODDIT_HOME/bench-state.json` (not `decisions/`, which is shared via
 * git), keyed by project root + node id.
 *
 * Only departures from the default are stored: open unfolded, finished
 * folded, unless the map says otherwise. Group rows (「✓ 已完成 N」 /
 * 「✓ 已结束 N」) use the same map and default to shut.
 */
export type Fold = 'collapsed' | 'expanded'
export type FoldMap = Record<string, Fold>

/** Read at call time, not import time, so tests can point NODDIT_HOME/DECS_HOME at a temp dir. */
export function benchStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(nodditEnv('HOME', env) || join(homedir(), '.decs'), 'bench-state.json')
}

export function foldKey(root: string, id: number): string {
  return `${root}#${id}`
}

/** 等待's 「延迟 N」 row: one key for the whole bench, not per project. */
export const DEFERRED_FOLD_KEY = 'deferred'

/** Where a 「✓ 已完成 N」 row (under `id`) or 「✓ 已结束 N」 row (no `id`) is remembered. */
export function groupFoldKey(root: string, id?: number): string {
  return id === undefined ? `${root}#done` : `${root}#${id}:done`
}

function readState(path: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    // Missing, unreadable or half-edited by hand: start from the defaults
    // rather than refuse to open bench.
    return {}
  }
}

export function loadFolds(path = benchStatePath()): FoldMap {
  const folds = readState(path).folds
  if (!folds || typeof folds !== 'object' || Array.isArray(folds)) return {}
  return Object.fromEntries(
    Object.entries(folds as Record<string, unknown>).filter((e): e is [string, Fold] => e[1] === 'collapsed' || e[1] === 'expanded'),
  )
}

/**
 * Re-reads the file first and changes only `key` — another bench window may
 * have folded something else meanwhile. A failed write just doesn't persist;
 * the fold still holds for this session.
 */
export function saveFold(key: string, fold: Fold | undefined, path = benchStatePath()): void {
  try {
    const state = readState(path)
    const folds = { ...loadFolds(path) }
    if (fold) folds[key] = fold
    else delete folds[key]
    mkdirSync(dirname(path), { recursive: true })
    writeFileAtomic(path, `${JSON.stringify({ ...state, version: 1, folds }, null, 2)}\n`)
  } catch {
    /* see above */
  }
}

/** What folding/unfolding `d` stores — nothing when that's already the default. */
export function foldFor(d: Pick<Decision, 'state'>, folded: boolean): Fold | undefined {
  if (isTerminal(d.state)) return folded ? undefined : 'expanded'
  return folded ? 'collapsed' : undefined
}

/** The map as the tree builder wants it: `keyOf` sets of collapsed / expanded nodes, and the opened done groups. */
export function foldSets(
  items: Decision[],
  folds: FoldMap,
  rootOf: (d: Decision) => string,
): { collapsed: Set<string>; expanded: Set<string>; openGroups: Set<string> } {
  const collapsed = new Set<string>()
  const expanded = new Set<string>()
  const openGroups = new Set<string>()
  const projects = new Set<string>()
  for (const d of items) {
    const root = rootOf(d)
    const f = folds[foldKey(root, d.id)]
    if (f === 'collapsed') collapsed.add(keyOf(d))
    if (f === 'expanded') expanded.add(keyOf(d))
    if (folds[groupFoldKey(root, d.id)] === 'expanded') openGroups.add(doneGroupKey(d))
    if (!projects.has(d.project)) {
      projects.add(d.project)
      if (folds[groupFoldKey(root)] === 'expanded') openGroups.add(doneGroupKey({ project: d.project }))
    }
  }
  if (folds[DEFERRED_FOLD_KEY] === 'expanded') openGroups.add(DEFERRED_GROUP)
  return { collapsed, expanded, openGroups }
}
