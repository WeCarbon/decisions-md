import { parseDuration } from './duration.ts'
import type { Decision as Item } from './types.ts'

/** in_progress with no update for a while → stuck. */

export const DEFAULT_STALE_AFTER_MS = 30 * 60_000

type Staleish = Pick<Item, 'state' | 'updatedAt' | 'created' | 'staleAfter' | 'activeAt'> & Partial<Pick<Item, 'deferredAt'>>

/** Minutes since the node's `updatedAt` (falling back to `created`). `Infinity` when neither parses. */
export function minutesSince(i: Pick<Item, 'updatedAt' | 'created' | 'activeAt'>, now = Date.now()): number {
  // Activity anywhere below counts: a parent is alive while its children move.
  const t = Date.parse(i.activeAt || i.updatedAt || i.created || '')
  if (Number.isNaN(t)) return Infinity
  return Math.max(0, (now - t) / 60_000)
}

export type Staleness = 'fresh' | 'stale' | 'very_stale'

/** Only `in_progress` goes stale — a node waiting on the owner (needs_decision) not moving is expected. */
export function stalenessOf(i: Staleish, now = Date.now()): Staleness {
  if (i.state !== 'in_progress') return 'fresh'
  // 延迟: the owner put it off; nobody is expected to move it.
  if (i.deferredAt) return 'fresh'
  const thresholdMs = i.staleAfter ? parseDuration(i.staleAfter) : DEFAULT_STALE_AFTER_MS
  const t = Date.parse(i.activeAt || i.updatedAt || i.created || '')
  if (Number.isNaN(t)) return 'fresh'
  const ms = now - t
  if (ms >= thresholdMs * 2) return 'very_stale'
  if (ms >= thresholdMs) return 'stale'
  return 'fresh'
}

export function isStale(i: Staleish, now = Date.now()): boolean {
  return stalenessOf(i, now) !== 'fresh'
}

export function isVeryStale(i: Staleish, now = Date.now()): boolean {
  return stalenessOf(i, now) === 'very_stale'
}

export interface ObsoleteOptions {
  now?: number
  /** Days with no update before an open node is flagged "possibly obsolete"; default 3. */
  staleDays?: number
}

/** "可能过时": nobody has touched this node in days and it is not done. */
export function isPossiblyObsolete(i: Pick<Item, 'state' | 'updatedAt' | 'created'>, opts: ObsoleteOptions = {}): boolean {
  if (i.state === 'completed' || i.state === 'closed') return false
  const now = opts.now ?? Date.now()
  const staleDays = opts.staleDays ?? 3
  return minutesSince(i, now) / (60 * 24) >= staleDays
}
