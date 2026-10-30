import { existsSync, readFileSync } from 'node:fs'
import { bool, one, type Args } from '../args.ts'
import { requireDecision, resolveStore } from '../context.ts'
import { approvalLabel, cyan, dim, renderDecision, toJSON } from '../../core/render.ts'
import { formatRef, parseBodyRefs, refOf } from '../../core/ref.ts'
import type { Store } from '../../core/store.ts'
import { imageProtocol, looksLikeImage, renderImage } from '../../tui/image.ts'
import { targetPath } from './open.ts'
import type { Decision } from '../../core/types.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.get')

/** Draws attachments: pictures inline, everything else as a copyable line, grouped by `--label`. */
function renderAttachments(d: Decision, store: Store, args: Args): string {
  if (!d.attachments.length) return ''
  const drawing = !bool(args, 'no-images') && Boolean(process.stdout.isTTY)
  const protocol = drawing ? imageProtocol() : null
  const cols = Number(one(args, 'cols') ?? 0) || Math.min(60, Math.max(20, (process.stdout.columns || 80) - 20))

  const out: string[] = ['', dim(t('cli.get.attachmentsHeading'))]
  let group: string | undefined
  for (const [i, a] of d.attachments.entries()) {
    if (a.group !== group) {
      group = a.group
      if (group) out.push(`  ${dim(`· ${group}`)}`)
    }

    const isUrl = a.target.includes('://')
    const path = targetPath(d.file, a.target)
    const hist = store.historyCount(d, a)
    const approval = store.findApproval(d, a.target)

    const tail: string[] = []
    if (isUrl) tail.push(a.target)
    if (hist) tail.push(t('cli.get.historyVersion', { n: hist }))
    if (approval) tail.push(approvalLabel(approval))

    out.push(`  ${cyan(String(i + 1))} ${a.label}${tail.length ? dim(`  ${tail.join('  ')}`) : ''}`)
    if (a.caption) out.push(dim(`    ${a.caption}`))

    if (isUrl || !a.image || !drawing) continue
    if (!existsSync(path)) {
      out.push(dim(`    ${t('cli.get.fileGone', { path })}`))
      continue
    }
    const { sequence, reason } = renderImage(path, { cols, name: a.label }, protocol)
    out.push(sequence || dim(`    ${reason} — ${t('cli.get.openHint', { id: d.id, n: i + 1 })}`))
  }
  return out.join('\n')
}

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const ref = args._[0]
  if (!ref) throw new Error(t('cli.get.whichOne'))

  const store = resolveStore(args, { allowRegistry: true })
  const d = requireDecision(store, ref, args)

  // 「被 W301 引用」: who mentions this one, found by scanning on read.
  const items = store.all()
  const cited = store.backlinks(d, items).map((o) => refOf(o))
  const letters = new Set(items.map((o) => o.letter ?? ''))
  const mentions = parseBodyRefs(d.body, letters)
    .map((r) => formatRef(r.id, r.letter === 'D' && !letters.has('D') ? d.letter : r.letter))
    .filter((r) => r !== refOf(d))
  if (bool(args, 'json')) console.log(JSON.stringify({ ...toJSON(d), refs: [...new Set(mentions)], referenced_by: cited }, null, 2))
  else if (bool(args, 'raw')) process.stdout.write(readFileSync(d.file, 'utf8'))
  else if (bool(args, 'answer'))
    console.log(d.answer ? (d.answer.choice ?? '') + (d.answer.note ? `\n${d.answer.note}` : '') : 'open')
  else {
    process.stdout.write(renderDecision(d))
    if (cited.length) process.stdout.write(`\n${dim(t('cli.get.referencedBy', { refs: cited.join(' ') }))}\n`)
    const attachments = renderAttachments(d, store, args)
    if (attachments) process.stdout.write(`${attachments}\n`)
  }
  return 0
}

export { looksLikeImage }
