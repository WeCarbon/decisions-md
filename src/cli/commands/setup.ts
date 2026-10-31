import { resolve } from 'node:path'
import { bool, many, one, type Args } from '../args.ts'
import { lang, t } from '../../i18n/index.ts'
import { AGENT_IDS, type AgentId, type AgentOutcome, setupAgent } from '../../core/agents.ts'

const help = () => t('cli.help.setup')

// Not `--agent`: that flag already means "this is the agent's own note/answer"
// everywhere else in this CLI (a boolean, no value) — `--for` picks which
// coding-agent CLI(s) `setup` targets instead.
function wantedAgents(args: Args): AgentId[] {
  const raw = many(args, 'for').flatMap((v) => v.split(','))
  if (!raw.length || raw.includes('all')) return [...AGENT_IDS]
  const unknown = raw.find((a) => !AGENT_IDS.includes(a as AgentId))
  if (unknown) throw new Error(t('cli.setup.unknownAgent', { name: unknown, agents: AGENT_IDS.join(', ') }))
  return [...new Set(raw as AgentId[])]
}

/** The line shown for one agent's outcome; `--json` skips this entirely. */
function line(agent: AgentId, outcome: AgentOutcome, dryRun: boolean): string {
  const detail = outcome.file ?? outcome.detail
  switch (outcome.action) {
    case 'skipped':
      return t('cli.setup.skipped', { agent })
    case 'created':
      return t(dryRun ? 'cli.setup.wouldCreate' : 'cli.setup.created', { agent, detail })
    case 'updated':
      return t(dryRun ? 'cli.setup.wouldUpdate' : 'cli.setup.updated', { agent, detail })
    case 'unchanged':
      return t('cli.setup.unchanged', { agent, detail })
    case 'manual':
      return t('cli.setup.manual', { agent, detail })
    case 'error':
      return t('cli.setup.error', { agent, detail })
  }
}

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }

  const dir = resolve(one(args, 'dir', 'd') ?? args._[0] ?? process.cwd())
  const dryRun = bool(args, 'dry-run')
  const agents = wantedAgents(args)
  const lng = lang()

  const results: Record<string, AgentOutcome> = {}
  for (const id of agents) results[id] = setupAgent(id, dir, lng, { dryRun })

  if (bool(args, 'json')) {
    console.log(JSON.stringify({ dir, dryRun, agents: results }, null, 2))
  } else {
    console.log(t('cli.setup.heading', { dir }))
    for (const id of agents) console.log(`  ${line(id, results[id], dryRun)}`)
  }

  return Object.values(results).some((r) => r.action === 'error') ? 1 : 0
}
