import { t } from '../i18n/index.ts'

/**
 * The shape of `Item.steps` — left as `unknown` in `core/types.ts` with the
 * comment "shape owned by the progress layer". This is that layer.
 */
export interface Step {
  label: string
  done: boolean
}

export function makeSteps(labels: string[]): Step[] {
  return labels.map((label) => ({ label: label.trim(), done: false }))
}

/** Reads back whatever `Item.steps` holds — tolerant of a bare string list, or a foreign shape. */
export function parseSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => {
    if (typeof s === 'string') return { label: s, done: false }
    const o = (s ?? {}) as Record<string, unknown>
    return { label: o.label !== undefined ? String(o.label) : '', done: Boolean(o.done) }
  })
}

/** Marks steps `1..n` done, `n+1..` not — "on step n" means the ones before it are behind you. */
export function markStep(steps: Step[], n: number): Step[] {
  if (!steps.length) throw new Error(t('core.steps.noneYet'))
  if (n < 1 || n > steps.length) throw new Error(t('core.steps.onlyNSteps', { count: steps.length }))
  return steps.map((s, i) => ({ ...s, done: i < n }))
}

export function stepProgress(steps: Step[]): number {
  if (!steps.length) return 0
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
}

/** The label of the furthest-along step, for `progressMsg`. */
export function currentStepLabel(steps: Step[]): string | undefined {
  const done = steps.filter((s) => s.done)
  return done.length ? done[done.length - 1].label : undefined
}
