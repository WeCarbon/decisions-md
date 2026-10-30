import { bool, one, type Args } from '../args.ts'
import { refOf } from '../../core/ref.ts'
import { readStdin, requireDecision, resolveAuthor, resolveStore, shellRole } from '../context.ts'
import { toJSON } from '../../core/render.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.push')

export async function run(args: Args): Promise<number> {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const [ref, ...rest] = args._
  if (!ref) throw new Error(`${t('cli.push.whichOne')}\n\n${help()}`)

  const store = resolveStore(args, { allowRegistry: true })
  const d = requireDecision(store, ref, args)
  const note = one(args, 'note', 'n') ?? ((await readStdin()).trim() || undefined)
  if (bool(args, 'human') && bool(args, 'agent')) throw new Error(t('cli.push.humanOrAgentOnly'))
  // Not `--by owner`: that name is a signature, and an agent writing it must
  // not turn its relayed answer into the owner approving outbound content.
  const role = bool(args, 'human') ? 'human' : bool(args, 'agent') ? 'agent' : shellRole()
  const by = one(args, 'by') ?? (role === 'human' ? 'owner' : resolveAuthor(args))

  const qs = d.questions ?? []
  const pairs = rest.filter((t) => t.includes('='))
  const key = rest.find((t) => !t.includes('='))
  if (!qs.length && pairs.length) throw new Error(t('cli.push.noSubQuestions', { ref: refOf(d), id: d.id }))

  let next
  if (qs.length && (pairs.length || bool(args, 'defaults'))) {
    const answers: Record<string, string> = {}
    const answerNotes: Record<string, string> = {}
    for (const p of pairs) {
      const [k, v] = [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]
      const colon = v.search(/[:：]/)
      answers[k.trim()] = (colon === -1 ? v : v.slice(0, colon)).trim()
      if (colon !== -1 && v.slice(colon + 1).trim()) answerNotes[k.trim()] = v.slice(colon + 1).trim()
    }
    // Strict on purpose: a forgotten Q3 must not silently become its default.
    const missing = qs.filter((q) => !(q.key in answers)).map((q) => q.key)
    if (missing.length && !bool(args, 'defaults'))
      throw new Error(
        t('cli.push.unanswered', {
          keys: missing.join(' '),
          defaults: missing.map((k) => `${k}=${qs.find((q) => q.key === k)!.default}`).join(' '),
        }),
      )
    next = store.answer(d, { answers, answerNotes, note, by, role })
  } else {
    next = store.answer(d, { choice: key, note, by, role })
  }

  if (bool(args, 'json')) console.log(JSON.stringify(toJSON(next)))
  else {
    const what = next.answer?.answers
      ? Object.entries(next.answer.answers).map(([k, v]) => `${k}=${v}`).join(' ')
      : next.answer?.choice ?? ''
    console.log(t('cli.push.answered', { ref: refOf(next), what: what ? ` ${what}` : '', author: next.author || 'lane' }))
  }
  return 0
}
