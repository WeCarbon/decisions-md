import { existsSync } from 'node:fs'
import { bool, one, type Args } from '../args.ts'
import { requireDecision, resolveStore } from '../context.ts'
import { dim, green } from '../../core/render.ts'
import { refOf } from '../../core/ref.ts'
import { sha256File } from '../../core/store.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.approved')

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const ref = args._[0]
  const path = one(args, 'check')
  if (!ref || !path) throw new Error(`${t('cli.approved.usage')}\n\n${help()}`)
  if (!existsSync(path)) throw new Error(t('core.store.noSuchFile', { path }))

  const store = resolveStore(args, { allowRegistry: true })
  const d = requireDecision(store, ref, args)
  const approval = store.findApproval(d, path)
  const hash = sha256File(path)
  const asJson = bool(args, 'json')

  if (!approval) {
    if (asJson) console.log(JSON.stringify({ ok: false, reason: 'never-attached', hash }))
    else console.error(t('cli.approved.neverAttached', { ref: refOf(d), path }))
    return 2
  }
  if (!approval.approvedHash && approval.declined) {
    if (asJson)
      console.log(JSON.stringify({ ok: false, reason: 'answer-not-approving', hash, answer: approval.declined, approveOn: approval.approveOn }))
    else
      console.error(
        t('cli.approved.answerNotApproving', {
          ref: refOf(d),
          path,
          answer: approval.declined,
          approveOn: approval.approveOn?.length ? t('cli.approved.approveOnSuffix', { approveOn: approval.approveOn.join(' / ') }) : '',
        }),
      )
    return 2
  }
  if (!approval.approvedHash) {
    if (asJson) console.log(JSON.stringify({ ok: false, reason: 'never-approved', hash, pendingHash: approval.hash }))
    else
      console.error(
        t('cli.approved.neverApproved', { ref: refOf(d), path, approveOn: approval.approveOn?.join(' / ') ?? t('cli.approved.thisNode') }),
      )
    return 2
  }
  if (approval.approvedHash !== hash) {
    if (asJson)
      console.log(JSON.stringify({ ok: false, reason: 'changed-since-approval', hash, approvedHash: approval.approvedHash }))
    else
      console.error(
        t('cli.approved.changedSinceApproval', { ref: refOf(d), path, approvedHash: approval.approvedHash, hash }),
      )
    return 1
  }

  if (asJson) console.log(JSON.stringify({ ok: true, hash }))
  else console.log(`${green(t('cli.approved.matches', { ref: refOf(d), path }))}${dim(` （${approval.approvedBy} · ${approval.approvedAt}）`)}`)
  return 0
}
