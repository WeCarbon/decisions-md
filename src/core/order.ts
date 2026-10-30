import type { Decision, Urgency } from './types.ts'

/**
 * The one ordering of "what should the owner look at first", shared by
 * `decs show`, `decs status` and the bench so they can never disagree.
 * Urgency outranks age; the owner's own pins outrank both.
 */
export const URGENCIES: readonly Urgency[] = ['high', 'normal', 'low']

export function urgencyOf(d: Pick<Decision, 'urgency'>): Urgency {
  return d.urgency ?? 'normal'
}

/** 0 = high, 1 = normal, 2 = low. */
export function urgencyRank(d: Pick<Decision, 'urgency'>): number {
  return URGENCIES.indexOf(urgencyOf(d))
}

const dueTime = (d: Pick<Decision, 'due'>) => {
  const t = d.due ? Date.parse(d.due) : NaN
  return Number.isNaN(t) ? Infinity : t
}

/** Is it past its stated deadline? An entry without one never is. */
export function overdue(d: Pick<Decision, 'due' | 'status'>, now = Date.now()): boolean {
  return d.status === 'open' && dueTime(d) < now
}

/** Higher urgency first; within the same urgency, the nearer deadline first. */
export function compareUrgency(a: Pick<Decision, 'urgency' | 'due'>, b: Pick<Decision, 'urgency' | 'due'>): number {
  const r = urgencyRank(a) - urgencyRank(b)
  if (r) return r
  const da = dueTime(a)
  const db = dueTime(b)
  return da === db ? 0 : da < db ? -1 : 1
}

/** Pinned to the top first, then by urgency and deadline, then longest-waiting, then whatever was parked. */
export function benchOrder(a: Decision, b: Decision): number {
  const rank = (d: Decision) => (d.pin === 'top' ? 0 : d.pin === 'bottom' ? 2 : 1)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  const u = compareUrgency(a, b)
  if (u) return u
  const ta = a.created || ''
  const tb = b.created || ''
  if (ta !== tb) return ta < tb ? -1 : 1
  return a.id - b.id
}
