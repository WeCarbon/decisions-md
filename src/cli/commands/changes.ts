import { bool, one, type Args } from '../args.ts'
import { resolveAuthor, resolveStore } from '../context.ts'
import { parseSince } from '../../core/duration.ts'
import { cyan, dim, green, yellow } from '../../core/render.ts'
import { listSources, sourceEventsSince, type SourceEventWithProject } from '../../core/sources.ts'
import { nowStamp, sameAgent, type ChangeEvent } from '../../core/store.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.changes')

const VERB: Record<ChangeEvent['event'], () => string> = {
  created: () => t('cli.changes.created'),
  answered: () => t('cli.changes.answered'),
  note: () => t('cli.changes.note'),
  completed: () => t('cli.changes.completed'),
  closed: () => t('cli.changes.closed'),
  reopened: () => t('cli.changes.reopened'),
}

const SOURCE_VERB: Record<SourceEventWithProject['kind'], () => string> = {
  new: () => t('cli.changes.sourceNew'),
  changed: () => t('cli.changes.sourceChanged'),
  gone: () => t('cli.changes.sourceGone'),
}

/** The append-only source log, filtered by project and, for `--mine`/`--author`, by the source's registered `owner_agent`. */
function sourceChanges(
  store: ReturnType<typeof resolveStore>,
  since: string,
  filter: { author?: string; project?: string },
): SourceEventWithProject[] {
  const owners = new Map(listSources(store).map((s) => [`${s.project}\0${s.name}`, s.ownerAgent]))
  return sourceEventsSince(store, new Date(Date.parse(since) - 1).toISOString()).filter((e) => {
    if (filter.project && e.project !== filter.project) return false
    const owner = owners.get(`${e.project}\0${e.source}`)
    return !filter.author || !owner || sameAgent(owner, filter.author) || sameAgent(filter.author, owner)
  })
}

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const raw = one(args, 'since')
  if (!raw || raw === 'true') throw new Error(`${t('cli.changes.needSince')}\n\n${help()}`)
  const role = one(args, 'role')
  if (role && role !== 'human' && role !== 'agent') throw new Error(t('cli.changes.badRole'))

  const store = resolveStore(args, { allowRegistry: true })
  const author = one(args, 'author') ?? (bool(args, 'mine') ? resolveAuthor(args) : undefined)
  // Taken before reading, so anything written while we read is after it and
  // shows up next time rather than falling into the gap.
  const until = nowStamp()
  const since = parseSince(raw)
  const project = one(args, 'project', 'p')
  const events = store.changes(since, { author, project, role: role as 'human' | 'agent' | undefined })
  const sourceEvents = role ? [] : sourceChanges(store, since, { author, project })

  if (bool(args, 'json')) {
    console.log(JSON.stringify({ since, until, next_since: until, events, source_events: sourceEvents }))
    return 0
  }
  if (!events.length && !sourceEvents.length) console.log(t('cli.changes.noneSince', { since }))
  const multi = store.layouts.length > 1
  // One timeline: node events and source events interleaved by time.
  const lines: { at: string; text: string }[] = sourceEvents.map((e) => ({
    at: e.at,
    text: [dim(e.at.slice(0, 19).replace('T', ' ')), cyan(`${e.source}#${e.id}`), multi ? dim(e.project) : null, SOURCE_VERB[e.kind](), dim('source'), e.title]
      .filter(Boolean)
      .join(' · ') + (e.state || e.url ? `\n    ${dim([e.state, e.url].filter(Boolean).join(' · '))}` : ''),
  }))
  for (const e of events) {
    const who = e.role === 'human' ? yellow(`human · ${e.by || 'owner'}`) : dim(`agent${e.by ? ` · ${e.by}` : ''}`)
    const verb = e.event === 'answered' ? green(`${e.kind ?? VERB.answered()}${e.choice ? ` ${e.choice}` : ''}`) : e.kind ?? VERB[e.event]()
    const first = e.text?.split('\n').find((l) => l.trim())
    lines.push({
      at: e.at,
      text:
        [dim(e.at.slice(0, 19).replace('T', ' ')), cyan(e.ref), multi ? dim(e.project) : null, verb, who, e.title]
          .filter(Boolean)
          .join(' · ') + (first ? `\n    ${dim(first.slice(0, 120))}` : ''),
    })
  }
  for (const l of lines.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) console.log(l.text)
  console.log(dim(`\n${t('cli.changes.nextHint', { until })}`))
  return 0
}
