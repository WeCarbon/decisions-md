import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DECS_HOME } from '../../core/config.ts'
import { bool, one, type Args } from '../args.ts'
import { resolveAuthor, resolveStore } from '../context.ts'
import { parseDuration, parseSince } from '../../core/duration.ts'
import { findLayout } from '../../core/paths.ts'
import { listSources, sourceEventsSince } from '../../core/sources.ts'
import { nowStamp, sameAgent, type ChangeEvent } from '../../core/store.ts'
import { refOf as refOfNode } from '../../core/ref.ts'
import { noteKindKey } from '../../core/format.ts'
import { settingValue } from '../../core/settings.ts'
import { durationText } from '../../i18n/time.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.monitor')

/** The Claude Code process this monitor runs under — walks up to the first `claude` in the process tree. */
function sessionPid(): number {
  let pid = process.ppid
  // No `ps` on Windows: the loop gives up and the session counts as the lead.
  for (let i = 0; i < 8 && pid > 1; i++) {
    try {
      const [ppid, ...comm] = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\s+/)
      if (/(^|\/)claude$/.test(comm.join(' '))) return pid
      pid = Number(ppid)
    } catch {
      break
    }
  }
  return process.ppid
}

/** The `--agent-name` a teammate session's agent process was started with; undefined for a lead. */
export function teammateName(command: string): string | undefined {
  return /(?:^|\s)--agent-name[ =](\S+)/.exec(command)?.[1]
}

function sessionCommand(): string {
  if (process.env.DECS_TEAMMATE !== undefined) return process.env.DECS_TEAMMATE ? `--agent-name ${process.env.DECS_TEAMMATE}` : ''
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(sessionPid())], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** Where this session's monitor got to, so re-arming with a bare `decs monitor` resumes from here. */
function cursorFile(roots: string[], mine: string | undefined): string {
  const key = createHash('sha1').update(JSON.stringify([sessionPid(), [...roots].sort(), mine ?? ''])).digest('hex').slice(0, 16)
  return join(DECS_HOME, 'monitor', `${key}.json`)
}

function loadCursor(file: string): string | undefined {
  try {
    const { cursor } = JSON.parse(readFileSync(file, 'utf8')) as { cursor?: string }
    // A day-old cursor belongs to a session that is long gone; start fresh.
    return cursor && Date.now() - Date.parse(cursor) < 86_400_000 ? cursor : undefined
  } catch {
    return undefined
  }
}

function saveCursor(file: string, cursor: string): void {
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ cursor }))
    renameSync(tmp, file)
  } catch {
    /* resuming is a convenience; the watch itself goes on */
  }
}

/** One line, so a multi-paragraph reply does not become several notifications. */
const flat = (s: string | null | undefined, max = 160) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function kindLabel(kind: string | undefined): string {
  if (!kind) return t('common.noteKind.reply')
  const key = noteKindKey(kind)
  return key ? t(`common.noteKind.${key}`) : kind
}

function nodeLine(e: ChangeEvent): string {
  const what =
    e.event === 'answered'
      ? t('cli.monitor.ownerAnswered', { choice: e.choice ? ` ${e.choice}` : '' })
      : e.event === 'reopened'
        ? t('cli.monitor.ownerReopened')
        : t('cli.monitor.ownerKind', { kind: kindLabel(e.kind) })
  const text = flat(e.text)
  return `${e.ref} ${t('cli.monitor.line', { what, title: e.title })}${text ? ` —— ${text}` : ''}  since=${e.at}`
}

export async function run(args: Args): Promise<number> {
  if (bool(args, 'help', 'h')) {
    console.log(help())
    return 0
  }
  const here = bool(args, 'here')
  if (here && !findLayout()) return 0
  const store = resolveStore(args, { allowRegistry: !here })
  // A teammate watches only its own nodes even when the plugin starts it without --mine; a lead watches everything.
  const teammate = one(args, 'author') || bool(args, 'mine') || bool(args, 'all') ? undefined : teammateName(sessionCommand())
  const author = one(args, 'author') ?? (bool(args, 'mine') ? resolveAuthor(args) : teammate)
  const asJson = bool(args, 'json')
  const withSources = !bool(args, 'no-sources')
  const interval = Math.max(200, Number(one(args, 'interval') ?? 2000) || 2000)
  const unclaimedMs = parseDuration(one(args, 'unclaimed-after') ?? settingValue('unclaimed-after').value)
  const sinceArg = one(args, 'since')
  const stateFile = cursorFile(store.layouts.map((l) => l.projectRoot), author)
  const resumed = sinceArg ? undefined : loadCursor(stateFile)
  let cursor = sinceArg ? parseSince(sinceArg) : (resumed ?? nowStamp(new Date(), { ms: true }))

  // Which sources are "mine": registered with an owner_agent this author matches, or with none.
  const mySource = (project: string, name: string): boolean => {
    if (!author) return true
    const s = listSources(store, Date.now()).find((x) => x.project === project && x.name === name)
    return !s?.ownerAgent || sameAgent(s.ownerAgent, author) || sameAgent(author, s.ownerAgent)
  }

  // Events at the cursor's own instant can come back on the next pass; a key
  // per event keeps each one to a single notification.
  const seen = new Map<string, number>()
  /** Each uncollected answer is reported once (per answer), not every pass. */
  const unclaimed = new Set<string>()
  const idleExitMs = parseDuration(one(args, 'idle-exit') ?? settingValue('idle-exit').value)
  let lastEventAt = Date.now()
  const emit = (key: string, at: string, text: string, json: Record<string, unknown>) => {
    if (seen.has(key)) return
    seen.set(key, Date.parse(at))
    lastEventAt = Date.now()
    process.stdout.write(`${asJson ? JSON.stringify(json) : text}\n`)
  }

  const pass = () => {
    const startedAt = nowStamp(new Date(), { ms: true })
    try {
      for (const e of store.changes(cursor, { author, role: 'human' })) {
        if (e.event === 'created' || e.event === 'completed' || e.event === 'closed') continue
        emit(`n|${e.project}|${e.id}|${e.event}|${e.at}`, e.at, nodeLine(e), { ...e, since: e.at })
      }
      if (withSources) {
        for (const e of sourceEventsSince(store, cursor)) {
          if (e.kind === 'gone' || !mySource(e.project, e.source)) continue
          const what = e.kind === 'new' ? t('cli.monitor.sourceNew') : t('cli.monitor.sourceChanged')
          const text = `${e.projectLetter}·${e.source}#${e.id} ${t('cli.monitor.line', { what, title: flat(e.title) })}${e.state ? ` [${e.state}]` : ''}${e.url ? ` ${e.url}` : ''}  since=${e.at}`
          emit(`s|${e.project}|${e.source}|${e.id}|${e.kind}|${e.at}`, e.at, text, { ...e, event: `source_${e.kind}`, since: e.at })
        }
      }
    } catch (err) {
      // One bad read (a file mid-rename) must not end the watch — but the
      // agent should know, so it goes out as an event of its own.
      process.stdout.write(`DECS-ERROR ${flat((err as Error).message)}\n`)
      return
    }
    // Safety net: an answer nobody collected goes out regardless of who
    // filed the node — a lead watching --mine would otherwise miss answers
    // on nodes it filed under a lane's name.
    try {
      // Picking up answers nobody collected is the lead's job.
      for (const d of teammate ? [] : store.queue({})) {
        const at = d.answer?.at ?? d.notes.filter((n) => n.role === 'human').at(-1)?.at
        const age = at ? Date.now() - Date.parse(at) : NaN
        if (!(age >= unclaimedMs)) continue
        const key = `u|${d.project}|${d.id}|${at}`
        if (unclaimed.has(key) || seen.has(`q|${d.project}|${d.id}`)) continue
        unclaimed.add(key)
        const mins = Math.round(age / 60_000)
        process.stdout.write(
          asJson
            ? `${JSON.stringify({ event: 'unclaimed', ref: refOfNode(d), id: d.id, project: d.project, title: d.title, author: d.author, minutes: mins })}\n`
            : `DECS-UNCLAIMED ${t('cli.monitor.unclaimed', { ref: refOfNode(d), duration: durationText(age), title: d.title, author: d.author })}\n`,
        )
      }
    } catch (err) {
      process.stdout.write(`DECS-ERROR ${flat((err as Error).message)}\n`)
    }
    cursor = startedAt
    saveCursor(stateFile, cursor)
    const keep = Date.parse(cursor) - 120_000
    for (const [k, ts] of seen) if (ts < keep) seen.delete(k)
  }

  process.stderr.write(
    `${t('cli.monitor.watching', { count: store.layouts.length, author: author ? t('cli.monitor.onlyAuthor', { author }) : '', from: resumed ? t('cli.monitor.resuming', { cursor }) : t('cli.monitor.startingAt', { cursor }) })}\n`,
  )
  // Already-answered, uncollected nodes go out first, so an answer that
  // landed before this monitor started isn't missed.
  try {
    for (const d of store.queue({ author })) {
      const text = t('cli.monitor.notCollected', { what: d.answer?.choice ? t('cli.monitor.repliedChoice', { choice: d.answer.choice }) : t('cli.monitor.hasReply') })
      emit(`q|${d.project}|${d.id}`, nowStamp(), `${t('cli.monitor.queued', { ref: refOfNode(d), title: d.title, text })}  since=${cursor}`, {
        event: 'queued', ref: refOfNode(d), id: d.id, project: d.project, title: d.title, choice: d.answer?.choice ?? null, since: cursor,
      })
    }
  } catch (err) {
    process.stdout.write(`DECS-ERROR ${flat((err as Error).message)}\n`)
  }
  pass()
  setInterval(() => {
    pass()
    if (idleExitMs > 0 && Date.now() - lastEventAt >= idleExitMs) {
      process.stdout.write(`DECS-IDLE ${t('cli.monitor.idle', { duration: durationText(idleExitMs) })}\n`)
      process.exit(0)
    }
  }, interval)
  return new Promise<number>(() => {})
}
