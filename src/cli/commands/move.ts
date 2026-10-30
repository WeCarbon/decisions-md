import { bool, one, type Args } from '../args.ts'
import { requireDecision, resolveStore } from '../context.ts'
import { refOf } from '../../core/ref.ts'
import { dim } from '../../core/render.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.move')

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const ref = args._[0]
  const parentRef = one(args, 'parent')
  const toRoot = bool(args, 'root')
  if (!ref || (!parentRef && !toRoot) || (parentRef && toRoot)) throw new Error(`${t('cli.move.usage')}\n\n${help()}`)

  const store = resolveStore(args, { allowRegistry: true })
  const d = requireDecision(store, ref, args)
  const parent = parentRef ? requireDecision(store, parentRef, args) : null
  const moved = store.move(d, parent)
  console.log(`${refOf(moved)} → ${parent ? t('cli.move.underParent', { ref: refOf(parent) }) : t('cli.move.toRoot')}  ${dim(moved.file)}`)
  return 0
}
