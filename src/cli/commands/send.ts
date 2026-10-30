import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { bool, many, one, oneLine, optionsAndDefault, questionsFromArgs, type Args } from '../args.ts'
import { readStdin, resolveAuthor, resolveStore, warnOtherAuthor } from '../context.ts'
import { parseDuration } from '../../core/duration.ts'
import { URGENCIES } from '../../core/order.ts'
import { splitFrontMatter } from '../../core/parse.ts'
import { refOf } from '../../core/ref.ts'
import { dim, toJSON } from '../../core/render.ts'
import { nowStamp } from '../../core/store.ts'
import { TITLE_MAX_COLS, assertTitleFits } from '../../core/title.ts'
import type { Decision, NewDecision, Urgency } from '../../core/types.ts'
import { t } from '../../i18n/index.ts'

function urgencyArg(raw: string | undefined): Urgency | undefined {
  if (raw === undefined) return undefined
  if (!(URGENCIES as readonly string[]).includes(raw)) throw new Error(t('cli.send.badUrgency', { urgencies: URGENCIES.join(' | '), value: raw }))
  return raw as Urgency
}

const help = () => t('cli.help.add', { max: TITLE_MAX_COLS, half: Math.floor(TITLE_MAX_COLS / 2) })

/** A piped document is a first-class input: front matter and a leading `# 标题` are both honoured. */
function fromPiped(text: string): { title?: string; body: string; meta: Record<string, unknown> } {
  const { data, body } = splitFrontMatter(text)
  const lines = body.split('\n')
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  const h1 = /^#[ \t]+(.+?)[ \t]*$/.exec(lines[i] ?? '')
  if (h1) return { title: h1[1], body: lines.slice(i + 1).join('\n').trim(), meta: data }
  return { title: data.title ? String(data.title) : undefined, body: body.trim(), meta: data }
}

export async function run(args: Args): Promise<number> {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }

  const bodyFile = one(args, 'body-file', 'f')
  const raw =
    one(args, 'body') ?? (bodyFile ? readFileSync(bodyFile, 'utf8') : await readStdin())
  const piped = fromPiped(raw)

  const title = args._.join(' ').trim() || piped.title
  if (!title) throw new Error(`${t('cli.send.titleRequired')}\n\n${help()}`)
  assertTitleFits(oneLine(title))

  const meta = piped.meta
  const { options: cliOptions, default: cliDefault } = optionsAndDefault(args)
  const questions = questionsFromArgs(args)

  const input: NewDecision = {
    title: oneLine(title),
    author: one(args, 'author', 'a') ?? (meta.author ? String(meta.author) : resolveAuthor(args)),
    body: piped.body,
    options: cliOptions,
    questions,
    default: cliDefault ?? (meta.default !== undefined ? String(meta.default) : undefined),
    tags: many(args, 'tag').length ? many(args, 'tag') : Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    urgency: urgencyArg(one(args, 'urgency') ?? (meta.urgency !== undefined ? String(meta.urgency) : undefined)),
    due: dueOf(one(args, 'due') ?? (meta.due !== undefined ? String(meta.due) : undefined)),
    ifNoAnswer: one(args, 'if-no-answer') ?? (meta.if_no_answer !== undefined ? String(meta.if_no_answer) : undefined),
    reversible: yesNo(one(args, 'reversible') ?? (meta.reversible !== undefined ? String(meta.reversible) : undefined), 'reversible'),
    kind: bool(args, 'fyi') || meta.kind === 'fyi' ? 'fyi' : undefined,
    task: bool(args, 'task'),
    parent: one(args, 'parent'),
    after: many(args, 'after').flatMap((s) => s.split(/[,\s]+/)).filter(Boolean),
    est: one(args, 'est'),
    when: one(args, 'when'),
    staleAfter: one(args, 'stale-after'),
    // Which session wrote this, so a bad entry can be traced back to its transcript.
    session: process.env.CLAUDE_SESSION_ID || process.env.DECS_SESSION || undefined,
  }

  const store = resolveStore(args)
  const d = store.create(input)
  warnOtherAuthor(d.author, refOf(d))

  if (bool(args, 'json')) console.log(JSON.stringify(toJSON(d)))
  else console.log(`${refOf(d)}  ${d.file}`)
  if (bool(args, 'notify')) notify(d)
  return 0
}

/** `yes`/`no` and friends, because that is what people type for a flag like this. */
function yesNo(raw: string | undefined, flag: string): boolean | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (['yes', 'y', 'true', '1', '可逆', '是'].includes(v)) return true
  if (['no', 'n', 'false', '0', '不可逆', '否'].includes(v)) return false
  throw new Error(t('cli.send.badYesNo', { flag, value: raw }))
}

/** An ISO time, or a duration from now (`4h`) — stored as ISO either way. */
function dueOf(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  if (/\d{4}-\d{2}-\d{2}/.test(raw)) {
    if (Number.isNaN(Date.parse(raw))) throw new Error(t('cli.send.badDue', { value: raw }))
    return raw
  }
  return nowStamp(new Date(Date.now() + parseDuration(raw)))
}

/** Runs `$DECS_NOTIFY_CMD` if set — no built-in channel, since pinging by default gets muted. */
function notify(d: Decision): void {
  const cmd = process.env.DECS_NOTIFY_CMD
  if (!cmd) {
    console.error(dim(t('cli.send.notifyUnset')))
    return
  }
  try {
    execSync(cmd, {
      stdio: ['ignore', 'ignore', 'inherit'],
      timeout: 15_000,
      env: {
        ...process.env,
        DECS_ID: String(d.id),
        DECS_REF: refOf(d),
        DECS_TITLE: d.title,
        DECS_URGENCY: d.urgency ?? 'normal',
        DECS_AUTHOR: d.author,
        DECS_PROJECT: d.project,
        DECS_FILE: d.file,
        DECS_DUE: d.due ?? '',
      },
    })
  } catch (e) {
    // The entry is already written; a failed ping must not make the lane think it was not.
    console.error(dim(t('cli.send.notifyFailed', { reason: (e as Error).message.split('\n')[0] })))
  }
}
