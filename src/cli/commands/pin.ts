import { type Args } from '../args.ts'
import { refOf } from '../../core/ref.ts'
import { requireDecision, resolveStore } from '../context.ts'
import type { DecisionPin } from '../../core/types.ts'
import { t } from '../../i18n/index.ts'

export function run(args: Args): number {
  const [ref, whereRaw = 'top'] = args._
  if (!ref) throw new Error(t('cli.pin.whichOne'))

  const where = whereRaw.toLowerCase()
  const pin: DecisionPin | null =
    where === 'top' ? 'top' : where === 'bottom' ? 'bottom' : where === 'off' || where === 'none' ? null : null
  if (!['top', 'bottom', 'off', 'none'].includes(where)) throw new Error(t('cli.pin.badWhere', { value: whereRaw }))

  const store = resolveStore(args, { allowRegistry: true })
  const d = requireDecision(store, ref, args)
  store.pin(d, pin)
  console.log(t('cli.pin.done', { ref: refOf(d), where: pin ? t(pin === 'top' ? 'cli.pin.top' : 'cli.pin.bottom') : t('cli.pin.off') }))
  return 0
}
