import { spawn } from 'node:child_process'
import { refOf } from '../../core/ref.ts'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { bool, type Args } from '../args.ts'
import { requireDecision, resolveStore } from '../context.ts'
import { openerFor } from '../../core/opener.ts'
import { cyan, dim } from '../../core/render.ts'
import { t } from '../../i18n/index.ts'

/** Resolves a link the way the markdown does: relative to the entry's own file. */
export function targetPath(entryFile: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return target
  return resolve(dirname(entryFile), target)
}

export function run(args: Args): number {
  const [ref, which] = args._
  if (!ref) throw new Error(t('cli.open.usage'))

  const store = resolveStore(args, { allowRegistry: true })
  const d = requireDecision(store, ref, args)

  if (!d.attachments.length) {
    console.log(t('cli.open.none', { ref: refOf(d) }))
    return 0
  }

  const picked = which ? [d.attachments[Number(which) - 1]] : d.attachments
  if (picked.some((a) => !a)) throw new Error(t('cli.open.onlyNAttachments', { ref: refOf(d), count: d.attachments.length }))

  for (const a of picked) {
    const p = targetPath(d.file, a.target)
    if (!p.includes('://') && !existsSync(p)) {
      console.error(`${a.label} ${dim('—')} ${t('cli.get.fileGone', { path: p })}`)
      continue
    }
    console.log(`${cyan(a.label)} ${dim(p)}`)
    if (!bool(args, 'dry-run')) {
      const opener = openerFor(p)
      spawn(opener.command, opener.args, { detached: true, stdio: 'ignore', ...opener.options }).unref()
    }
  }
  return 0
}
