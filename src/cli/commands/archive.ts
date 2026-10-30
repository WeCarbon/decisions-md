import { bool, type Args } from '../args.ts'
import { refOf } from '../../core/ref.ts'
import { requireDecision, resolveStore } from '../context.ts'
import { dim } from '../../core/render.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.archive')

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  if (!args._.length) throw new Error(`${t('cli.archive.whichOne')}\n\n${help()}`)

  const store = resolveStore(args, { allowRegistry: true })
  const undo = bool(args, 'undo')

  for (const ref of args._) {
    const d = requireDecision(store, ref, args)
    if (undo) {
      const back = store.unarchive(d)
      console.log(t('cli.archive.backToActive', { ref: refOf(back) }))
      continue
    }
    if (bool(args, 'seen')) {
      const done = store.dismiss(d)
      console.log(t('cli.archive.seen', { ref: refOf(done), file: done.file }))
      continue
    }
    if (d.state === 'needs_decision' && !bool(args, 'force')) {
      throw new Error(t('cli.archive.stillNeedsDecision', { ref: refOf(d) }))
    }
    if (d.queued) console.log(dim(t('cli.archive.stillQueued', { ref: refOf(d) })))
    const done = store.archive(d)
    console.log(t('cli.archive.archived', { ref: refOf(done), file: done.file }))
  }
  return 0
}
