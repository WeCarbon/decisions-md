import { bool, one, type Args } from '../args.ts'
import { requireDecision, resolveAuthor, resolveStore } from '../context.ts'
import { refOf } from '../../core/ref.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.supersede')

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const by = one(args, 'by')
  if (!args._.length || !by || by === 'true') throw new Error(`${t('cli.supersede.usage')}\n\n${help()}`)
  const store = resolveStore(args, { allowRegistry: true })
  const replacement = requireDecision(store, by, args)
  for (const ref of args._) {
    const old = store.supersede(requireDecision(store, ref, args), replacement, resolveAuthor(args))
    console.log(t('cli.supersede.done', { ref: refOf(old), by: refOf(replacement) }))
  }
  return 0
}
