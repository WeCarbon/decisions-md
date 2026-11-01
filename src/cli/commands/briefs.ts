import { bool, one, type Args } from '../args.ts'
import { resolveStore } from '../context.ts'
import { briefState, isUnclaimedBrief } from '../../core/intake.ts'
import { projectSessions } from '../../core/listeners.ts'
import { refOf } from '../../core/ref.ts'
import { bold, dim, toJSON } from '../../core/render.ts'
import { benchOrder } from '../../core/store.ts'
import type { Decision } from '../../core/types.ts'
import { durationText } from '../../i18n/time.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.briefs')

/** `nod briefs` — what the owner has filed for an AI to pick up, and whether anyone is listening. */
export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const store = resolveStore(args, { allowRegistry: true })
  const given = one(args, 'project', 'p')
  const project = given ? store.projectKey(given) : undefined
  const all = bool(args, 'all')
  const briefs = store
    .all()
    .filter((d) => (project ? d.project === project : true))
    .filter((d) => (all ? briefState(d) !== null : isUnclaimedBrief(d)))
    .sort(benchOrder)
  const projects = projectSessions(store).filter((p) => (project ? p.project === project : true))

  if (bool(args, 'json')) {
    console.log(JSON.stringify({ projects, briefs: briefs.map(toJSON) }))
    return 0
  }
  const now = Date.now()
  for (const p of projects) {
    const mine = briefs.filter((d) => d.project === p.project)
    const who = p.listening
      ? t('cli.briefs.listening', { who: p.sessions.filter((x) => x.role === 'lead').map((x) => x.author ?? x.harness ?? String(x.pid)).join(', ') })
      : t('cli.briefs.nobody')
    console.log(`${bold(p.project)} · ${who}`)
    if (!mine.length) console.log(dim(`  ${t('cli.briefs.none')}`))
    for (const d of mine) console.log(`  ${line(d, now)}`)
  }
  return 0
}

function line(d: Decision, now: number): string {
  const age = durationText(Math.max(0, now - Date.parse(d.created)))
  const state = d.claimedBy ? t('cli.briefs.claimedBy', { who: d.claimedBy }) : t('cli.briefs.waiting', { duration: age })
  return `${refOf(d)}  ${d.title}  ${dim(state)}`
}
