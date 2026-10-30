import { isAnswerKind } from './format.ts'
import { watch, type FSWatcher } from 'node:fs'
import { sameAgent, type Store } from './store.ts'
import type { Decision, DecisionNote, NoteRole } from './types.ts'

export type DecisionEvent =
  | { event: 'new'; decision: Decision }
  | { event: 'answered'; decision: Decision }
  | { event: 'note'; decision: Decision; heading: string; text: string; role: NoteRole; by: string }
  | { event: 'gone'; id: number; project: string }

interface Snapshot {
  status: Decision['status']
  followUps: string[]
  project: string
}

/** Every appended section except answers (the `answered` event); includes
 *  agent notes so a human watching the pane sees lanes reporting too. */
function followUpsOf(d: Decision): DecisionNote[] {
  return d.notes.filter((n) => !isAnswerKind(n.kind))
}

export function sectionText(body: string, heading: string): string {
  const lines = body.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`))
  if (start === -1) return ''
  let end = start + 1
  while (end < lines.length && !/^##[ \t]+\S/.test(lines[end])) end++
  return lines.slice(start + 1, end).join('\n').trim()
}

export function eventJson(e: DecisionEvent): Record<string, unknown> {
  if (e.event === 'gone') return { event: 'gone', id: e.id, project: e.project }
  const d = e.decision
  const base = { event: e.event, id: d.id, project: d.project, title: d.title, author: d.author }
  if (e.event === 'answered') {
    return {
      ...base,
      choice: d.answer?.choice ?? null,
      label: d.options.find((o) => o.key === d.answer?.choice)?.label ?? null,
      note: d.answer?.note ?? null,
      by: d.answer?.by ?? null,
      at: d.answer?.at ?? null,
      file: d.file,
    }
  }
  if (e.event === 'note') return { ...base, heading: e.heading, text: e.text, role: e.role, by: e.by }
  return { ...base, options: d.options.map((o) => ({ key: o.key, label: o.label })), file: d.file }
}

export interface WatchOptions {
  /** Only report on these decisions. Empty means everything in the store. */
  ids?: number[]
  author?: string
  /** fs.watch misses things often enough that a slow poll is cheap insurance. */
  pollMs?: number
  signal?: AbortSignal
}

/**
 * Reports what changed in the decision files, as it changes. Backed by
 * fs.watch plus a slow poll, since missing an event is worse than a cheap
 * periodic scan.
 */
export function watchDecisions(
  store: Store,
  onEvent: (e: DecisionEvent) => void,
  opts: WatchOptions = {},
): () => void {
  const { pollMs = 3000 } = opts
  const watchers: FSWatcher[] = []
  let timer: NodeJS.Timeout | undefined
  let scanning = false

  const interesting = (d: Decision) =>
    (!opts.ids?.length || opts.ids.includes(d.id)) &&
    (!opts.author || sameAgent(d.author, opts.author))

  const snapshot = new Map<string, Snapshot>()
  const keyOf = (d: Decision) => `${d.project}#${d.id}`

  for (const d of store.all()) {
    if (interesting(d)) snapshot.set(keyOf(d), { status: d.status, followUps: followUpsOf(d).map((n) => n.heading), project: d.project })
  }

  const scan = () => {
    if (scanning) return
    scanning = true
    try {
      const current = store.all().filter(interesting)
      const seen = new Set<string>()

      for (const d of current) {
        const key = keyOf(d)
        seen.add(key)
        const prior = snapshot.get(key)
        const notes = followUpsOf(d)
        const followUps = notes.map((n) => n.heading)

        if (!prior) {
          snapshot.set(key, { status: d.status, followUps, project: d.project })
          onEvent({ event: 'new', decision: d })
          continue
        }
        if (prior.status !== 'answered' && d.status === 'answered') {
          onEvent({ event: 'answered', decision: d })
        }
        for (const n of notes) {
          if (!prior.followUps.includes(n.heading))
            onEvent({ event: 'note', decision: d, heading: n.heading, text: n.text, role: n.role, by: n.author })
        }
        snapshot.set(key, { status: d.status, followUps, project: d.project })
      }

      for (const [key, prior] of snapshot) {
        if (seen.has(key)) continue
        snapshot.delete(key)
        onEvent({ event: 'gone', id: Number(key.split('#')[1]), project: prior.project })
      }
    } finally {
      scanning = false
    }
  }

  let debounce: NodeJS.Timeout | undefined
  const nudge = () => {
    clearTimeout(debounce)
    debounce = setTimeout(scan, 120)
  }

  for (const l of store.layouts) {
    for (const dir of [l.activeDir, l.archivedDir]) {
      try {
        watchers.push(watch(dir, nudge))
      } catch {
        /* the poll still covers it */
      }
    }
  }
  if (pollMs > 0) timer = setInterval(scan, pollMs)

  const stop = () => {
    clearTimeout(debounce)
    if (timer) clearInterval(timer)
    for (const w of watchers) w.close()
  }
  opts.signal?.addEventListener('abort', stop, { once: true })
  return stop
}
