import { statusLabel } from '../../core/status.ts'
import { bool, one, type Args } from '../args.ts'
import { requireDecision, resolveAuthor, resolveStore, shellRole } from '../context.ts'
import { refOf } from '../../core/ref.ts'
import { toJSON } from '../../core/render.ts'
import { type NoteRole } from '../../core/types.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.defer')

export async function run(args: Args, verb = 'defer'): Promise<number> {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  if (!args._.length) throw new Error(`${t('cli.lifecycle.whichNode')}\n\n${help()}`)
  if (bool(args, 'human') && bool(args, 'agent')) throw new Error(t('cli.push.humanOrAgentOnly'))
  const off = verb === 'undefer' || bool(args, 'off')
  const role: NoteRole = bool(args, 'human') ? 'human' : bool(args, 'agent') ? 'agent' : shellRole()
  const by = one(args, 'by') ?? (role === 'human' ? 'owner' : resolveAuthor(args))
  const store = resolveStore(args, { allowRegistry: true })
  for (const ref of args._) {
    const d = requireDecision(store, ref, args)
    const next = off ? store.undefer(d, { by, role }) : store.defer(d, { by, role })
    if (bool(args, 'json')) console.log(JSON.stringify(toJSON(next)))
    else {
      const what = off
        ? d.deferredAt
          ? t('cli.defer.undeferred')
          : t('cli.defer.wasNotDeferred')
        : d.deferredAt
          ? t('cli.defer.wasAlreadyDeferred')
          : t('cli.defer.deferred')
      console.log(`${refOf(next)} ${what} · ${statusLabel(next.state)}`)
    }
  }
  return 0
}
