import { bool, one, type Args } from '../args.ts'
import { refOf } from '../../core/ref.ts'
import { resolveAuthor, resolveStore } from '../context.ts'
import { watchDecisions, type DecisionEvent } from '../../core/watch.ts'
import { cyan, dim, green, yellow } from '../../core/render.ts'
import { eventJson } from '../../core/watch.ts'
import { list, t } from '../../i18n/index.ts'

const help = () => t('cli.help.watch')

export function run(args: Args): Promise<number> {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return Promise.resolve(0)
  }
  const store = resolveStore(args, { allowRegistry: true })
  const author = one(args, 'author') ?? (bool(args, 'mine') ? resolveAuthor(args) : undefined)
  const asJson = bool(args, 'json')

  const stamp = () => dim(new Date().toTimeString().slice(0, 8))
  const line = (e: DecisionEvent): string => {
    if (e.event === 'gone') return `${stamp()} ${dim('－')} ${t('cli.watch.fileGone', { project: e.project, id: e.id })}`
    const d = e.decision
    const head = `${stamp()} `
    if (e.event === 'new') return `${head}${yellow('＋')} ${cyan(refOf(d))} ${dim(d.project)} ${d.title} ${dim(`· ${d.author}`)}`
    if (e.event === 'answered')
      return `${head}${green('✓')} ${cyan(refOf(d))} ${dim(d.project)} ${t('cli.watch.answered', { choice: d.answer?.choice ? ` ${d.answer.choice}` : '' })}${d.answer?.note ? ` ${dim('—')} ${d.answer.note}` : ''}`
    return `${head}${cyan('?')} ${cyan(refOf(d))} ${dim(d.project)} ${e.heading}`
  }

  console.error(
    dim(t('cli.watch.watching', { roots: list(store.layouts.map((l) => l.projectRoot)), author: author ? t('cli.watch.onlyAuthor', { author }) : '' })),
  )
  watchDecisions(store, (e) => console.log(asJson ? JSON.stringify(eventJson(e)) : line(e)), { author })
  return new Promise(() => {})
}
