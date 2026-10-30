import { watch, type FSWatcher } from 'node:fs'
import { refOf } from '../../core/ref.ts'
import { bool, one, type Args } from '../args.ts'
import { parseRef, resolveAuthor, resolveStore } from '../context.ts'
import { cyan, dim } from '../../core/render.ts'
import { nowStamp, sameAgent, type Store } from '../../core/store.ts'
import type { Decision } from '../../core/types.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.wait')

/** fs.watch misses events often enough that a slow poll is cheap insurance. */
function watchQueue(store: Store, filter: { author?: string }, onChange: () => void): () => void {
  const watchers: FSWatcher[] = []
  let debounce: NodeJS.Timeout | undefined
  const nudge = () => {
    clearTimeout(debounce)
    debounce = setTimeout(onChange, 120)
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
  const timer = setInterval(onChange, 3000)
  return () => {
    clearTimeout(debounce)
    clearInterval(timer)
    for (const w of watchers) w.close()
  }
}

/** Deliberately vague about how many — it's a snapshot and may already be stale. */
function summarise(items: Decision[], mine: boolean): string {
  const ids = items.map((d) => refOf(d)).join(' ')
  const flag = mine ? ' --mine' : ''
  return [
    `${cyan(t('cli.wait.updates'))}${dim(t('cli.wait.snapshotHint', { ids }))}`,
    dim(t('cli.wait.nextSteps', { flag })),
  ].join('\n')
}

export function run(args: Args): Promise<number> {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return Promise.resolve(0)
  }

  const store = resolveStore(args, { allowRegistry: true })
  const ids = args._.map((r) => parseRef(r).id)
  const author = one(args, 'author') ?? (bool(args, 'mine') ? resolveAuthor(args) : undefined)
  const asJson = bool(args, 'json')
  const timeoutSec = Number(one(args, 'timeout') ?? 0)

  const peek = () =>
    store.queue({ author, project: one(args, 'project', 'p') }).filter((d) => (ids.length ? ids.includes(d.id) : true))

  // Everything before this moment is on the queue or already delivered.
  let checkedAt = nowStamp()
  const sinceHint = () => dim(t('cli.wait.catchUpHint', { since: checkedAt, flag: bool(args, 'mine') ? ' --mine' : '' }))

  const report = (items: Decision[]) => {
    if (asJson) {
      console.log(
        JSON.stringify({
          updates: true,
          count_at_wake: items.length,
          ids_at_wake: items.map((d) => ({ id: d.id, ref: refOf(d), project: d.project, status: d.state })),
          next: 'decs queue --json',
          since: checkedAt,
        }),
      )
    } else {
      console.log(summarise(items, bool(args, 'mine')))
      console.log(sinceHint())
    }
  }

  const now = peek()
  if (now.length) {
    report(now)
    return Promise.resolve(0)
  }

  return new Promise<number>((resolve) => {
    const finish = (code: number) => {
      stop()
      clearTimeout(timer)
      resolve(code)
    }

    const check = () => {
      checkedAt = nowStamp()
      const items = peek()
      if (!items.length) return
      report(items)
      finish(0)
    }

    const stop = watchQueue(store, { author }, check)

    const timer = timeoutSec
      ? setTimeout(() => {
          const stuck = store
            .list({ status: 'open', archived: false })
            .filter((d) => (author ? sameAgent(d.author, author) : true))
            .filter((d) => (ids.length ? ids.includes(d.id) : true))
          checkedAt = nowStamp()
          console.error(t('cli.wait.timedOut', { seconds: timeoutSec }))
          for (const d of stuck) {
            const def = d.options.find((o) => o.key === d.default)
            console.error(def ? t('cli.wait.defaultAction', { ref: refOf(d), key: def.key, label: def.label }) : t('cli.wait.noDefaultAction', { ref: refOf(d) }))
            if (d.ifNoAnswer)
              console.error(
                t('cli.wait.ifNoAnswer', { text: d.ifNoAnswer, irreversible: d.reversible === false ? t('cli.wait.irreversible') : '' }),
              )
          }
          if (asJson) console.log(JSON.stringify({ updates: false, timed_out: true, since: checkedAt }))
          else console.error(sinceHint())
          finish(2)
        }, timeoutSec * 1000)
      : undefined
  })
}
