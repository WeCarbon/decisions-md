import { isAnswerKind } from '../../core/format.ts'
import { bool, one, type Args } from '../args.ts'
import { refOf } from '../../core/ref.ts'
import { resolveAuthor, resolveStore } from '../context.ts'
import { alignRow, cyan, dim, green, toJSON, yellow } from '../../core/render.ts'
import { parseDuration } from '../../core/duration.ts'
import { lastHumanAt } from '../../core/store.ts'
import { elapsed, fromNow } from '../../i18n/time.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.queue')

export function run(args: Args): number {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const store = resolveStore(args, { allowRegistry: true })
  const author = one(args, 'author') ?? (bool(args, 'mine') ? resolveAuthor(args) : undefined)
  const staleRaw = one(args, 'stale')
  const staleMs = staleRaw ? parseDuration(staleRaw === 'true' ? '1h' : staleRaw) : 0
  const items = store.queue({ author, project: one(args, 'project', 'p') }).filter((d) => {
    if (!staleMs) return true
    const at = lastHumanAt(d) ?? d.created
    return Date.now() - Date.parse(at) > staleMs
  })

  if (bool(args, 'json')) {
    console.log(JSON.stringify(items.map(toJSON)))
    return 0
  }
  if (!items.length) {
    console.log(staleMs ? t('cli.queue.noneStale', { duration: staleRaw }) : t('cli.queue.empty'))
    return 0
  }
  const multi = store.layouts.length > 1
  for (const d of items) {
    // What woke it: the owner's latest words — an answer, or a follow-up after it.
    const last = [...d.notes].reverse().find((n) => n.role === 'human')
    const followUp = last ? !isAnswerKind(last.kind) : d.state === 'needs_decision'
    const what = followUp ? cyan(t('cli.queue.reply')) : green(t('cli.queue.answered', { choice: d.answer?.choice ? ` ${d.answer.choice}` : '' }))
    const at = lastHumanAt(d) ?? d.created
    console.log(
      alignRow(
        [
          cyan(refOf(d)),
          multi && d.project ? dim(d.project) : null,
          what,
          d.title,
          dim(t('cli.queue.proposedBy', { author: d.author || t('cli.queue.noAuthor') })),
          staleMs ? yellow(t('cli.queue.answeredUncollected', { duration: elapsed(at) })) : dim(fromNow(at)),
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    )
  }
  return 0
}
