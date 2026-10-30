import { bool, oneLine, type Args } from '../args.ts'
import { requireDecision, resolveStore } from '../context.ts'
import { refOf } from '../../core/ref.ts'
import { dim } from '../../core/render.ts'
import { TITLE_MAX_COLS, assertTitleFits } from '../../core/title.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.retitle', { max: TITLE_MAX_COLS, half: Math.floor(TITLE_MAX_COLS / 2) })

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const [ref, ...rest] = args._
  const title = oneLine(rest.join(' '))
  if (!ref || !title) throw new Error(`${t('cli.retitle.usage')}\n\n${help()}`)
  assertTitleFits(title)

  const store = resolveStore(args, { allowRegistry: true })
  const d = requireDecision(store, ref, args)
  const next = store.retitle(d, title)
  console.log(`${refOf(next)} ${dim(d.title)} → ${next.title}`)
  return 0
}
