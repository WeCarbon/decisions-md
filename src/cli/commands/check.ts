import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { bool, type Args } from '../args.ts'
import { resolveStore } from '../context.ts'
import { listEntryFiles } from '../../core/paths.ts'
import { parseDecision } from '../../core/parse.ts'
import { findDuplicateOptions } from '../../core/repair.ts'
import { listSourceNames, listSources, readSourceConfig } from '../../core/sources.ts'
import { findCycles } from '../../core/sequence.ts'
import { dim, green, yellow } from '../../core/render.ts'
import { configProblems } from '../../core/project.ts'
import { TITLE_MAX_COLS, titleProblem } from '../../core/title.ts'
import { t } from '../../i18n/index.ts'

interface Problem {
  level: 'error' | 'warn'
  file: string
  message: string
  fixable?: () => void
  /** What `fixable` would change, for `--fix --dry-run`. */
  preview?: string
}

/** Validates every entry: duplicate ids/keys, broken options, missing id reservations, dependency cycles. */
export function run(args: Args): number {
  const store = resolveStore(args, { allowRegistry: true })
  const problems: Problem[] = []
  const seen = new Map<string, string>()

  for (const c of store.letterClashes())
    problems.push({
      level: 'warn',
      file: c.projects.join(', '),
      message: t('cli.check.letterClash', { letter: c.letter }),
    })
  for (const layout of store.layouts) {
    for (const message of configProblems(layout))
      problems.push({ level: 'error', file: join(basename(layout.projectRoot), 'decisions', 'decs.json'), message })
    for (const f of listEntryFiles(layout)) {
      const rel = relative(layout.projectRoot, f.path)
      let d
      let raw = ''
      try {
        raw = readFileSync(f.path, 'utf8')
        d = parseDecision(raw, f.path, f.archived, basename(layout.projectRoot))
      } catch (e) {
        problems.push({ level: 'error', file: rel, message: (e as Error).message })
        continue
      }

      const key = `${layout.projectRoot}#${d.id}`
      const prior = seen.get(key)
      if (prior) problems.push({ level: 'error', file: rel, message: t('cli.check.idReused', { id: d.id, other: prior }) })
      else seen.set(key, rel)

      if (d.id !== f.id) problems.push({ level: 'error', file: rel, message: t('cli.check.idMismatch', { fmId: d.id, fileId: f.id }) })
      const tooLong = titleProblem(d.title)
      if (tooLong)
        problems.push({
          level: 'warn',
          file: rel,
          message: t('cli.check.titleTooLong', { max: TITLE_MAX_COLS }),
        })
      if (!d.author) problems.push({ level: 'warn', file: rel, message: t('cli.check.noAuthor') })
      if (!d.created) problems.push({ level: 'warn', file: rel, message: t('cli.check.noCreated') })
      if (!d.body.trim()) problems.push({ level: 'warn', file: rel, message: t('cli.check.emptyBody') })

      // An older `decs ask` appended an empty copy of an options block the
      // text already carried; it parses as twice the options.
      const dup = findDuplicateOptions(raw)
      if (dup) {
        const node = d
        problems.push({
          level: 'error',
          file: rel,
          message: t('cli.check.duplicateOptions', { fromLine: dup.fromLine, toLine: dup.toLine, count: d.options.length }),
          preview: t('cli.check.duplicateOptionsPreview', { rel, fromLine: dup.fromLine, toLine: dup.toLine, drops: dup.drops.trim(), keeps: dup.keeps.trim() }),
          fixable: () => void store.collapseDuplicateOptions(node),
        })
      }

      const keys = d.options.map((o) => o.key)
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
      // The doubled block above is the usual cause; say it once, the fixable way.
      if (dupes.length && !dup) problems.push({ level: 'error', file: rel, message: t('cli.check.optionKeyRepeated', { keys: [...new Set(dupes)].join(', ') }) })
      if (d.default && !keys.length)
        problems.push({ level: 'error', file: rel, message: t('cli.check.defaultNoOptions', { default: d.default }) })
      else if (d.default && !keys.includes(d.default))
        problems.push({ level: 'error', file: rel, message: t('cli.check.defaultNotAnOption', { default: d.default, keys: keys.join(', ') }) })
      if (d.state === 'needs_decision' && !d.options.length)
        problems.push({ level: 'warn', file: rel, message: t('cli.check.noOptions') })

      // An answered entry in active/ is normal now: it means collected but not
      // yet done. Only the archived-and-still-queued combination is wrong.
      if (d.queued && d.archived)
        problems.push({ level: 'warn', file: rel, message: t('cli.check.archivedButQueued') })
      if (d.archived && !d.answer && (d.kind === 'decision' || d.kind === 'acceptance') && d.state !== 'closed')
        problems.push({ level: 'warn', file: rel, message: t('cli.check.archivedWithoutAnswer') })

      const attachedTargets = new Set(d.attachments.map((a) => a.target))
      for (const ap of d.approvals) {
        if (!attachedTargets.has(ap.target))
          problems.push({
            level: 'warn',
            file: rel,
            message: t('cli.check.approvalWithoutAttachment', { target: ap.target }),
          })
      }

      const reservation = join(layout.idsDir, String(d.id))
      if (!existsSync(reservation))
        problems.push({
          level: 'warn',
          file: rel,
          message: t('cli.check.noIdReservation', { id: d.id }),
          fixable: () => {
            mkdirSync(layout.idsDir, { recursive: true })
            try {
              closeSync(openSync(reservation, 'wx'))
            } catch {
              /* already there */
            }
          },
        })
    }
  }

  // Sources: just enough to catch a broken registration or a dead adapter —
  // everything else (buckets, cleared) is `decs source list`'s job, not
  // check's.
  for (const layout of store.layouts) {
    for (const name of listSourceNames(layout)) {
      const rel = `sources/${name}/source.md`
      if (!readSourceConfig(layout, name))
        problems.push({ level: 'error', file: rel, message: t('cli.check.sourceUnparseable') })
    }
  }
  for (const s of listSources(store)) {
    if (s.stale)
      problems.push({
        level: 'warn',
        file: `sources/${s.name}/source.md`,
        message: t('cli.check.adapterMaybeDown', { heartbeat: s.heartbeatAt ? '' : t('cli.check.neverHeartbeat') }),
      })
  }

  // `after` dependency cycles — a cycle makes every node in it permanently
  // unstartable (`isStartable` would never see a terminal node to stop at),
  // so it is an error here rather than something bench silently renders as
  // forever "waiting".
  for (const cycle of findCycles(store.all())) {
    problems.push({
      level: 'error',
      file: 'after:',
      message: t('cli.check.dependencyCycle', { cycle: cycle.map((r) => r.ref).join(' → ') }),
    })
  }

  if (bool(args, 'fix') && bool(args, 'dry-run')) {
    const would = problems.filter((p) => p.fixable)
    for (const p of would) console.log(`${dim(t('cli.check.wouldFix'))} ${p.preview ?? `${p.file} — ${p.message}`}`)
    console.log(dim(would.length ? t('cli.check.dryRunWouldFix', { count: would.length }) : t('cli.check.dryRunNothingFixable')))
    return problems.some((p) => p.level === 'error') ? 1 : 0
  }
  if (bool(args, 'fix')) {
    let fixed = 0
    for (const p of problems)
      if (p.fixable) {
        p.fixable()
        if (p.preview) console.log(`${green(t('cli.check.fixed'))} ${p.preview}`)
        fixed++
      }
    if (fixed) console.log(green(t('cli.check.fixedCount', { count: fixed })))
    // What was just repaired is not still a problem.
    for (let i = problems.length - 1; i >= 0; i--) if (problems[i].fixable) problems.splice(i, 1)
  }

  const errors = problems.filter((p) => p.level === 'error')
  if (bool(args, 'json')) {
    console.log(JSON.stringify(problems.map(({ level, file, message }) => ({ level, file, message }))))
    return errors.length ? 1 : 0
  }
  // The same warning across dozens of migrated entries is one fact, not fifty.
  const byMessage = new Map<string, Problem[]>()
  for (const p of problems) byMessage.set(p.message, [...(byMessage.get(p.message) ?? []), p])

  for (const [message, group] of byMessage) {
    const mark = group[0].level === 'error' ? '✗' : yellow('!')
    for (const p of group.slice(0, 5)) console.log(`${mark} ${p.file} ${dim('—')} ${message}`)
    if (group.length > 5) console.log(`  ${dim(t('cli.check.moreSameMessage', { count: group.length - 5, message }))}`)
  }

  const total = [...seen.keys()].length
  console.log(
    problems.length
      ? dim(`\n${t('cli.check.summary', { total, errors: errors.length, warnings: problems.length - errors.length })}`)
      : green(t('cli.check.summaryOk', { total })),
  )
  return errors.length ? 1 : 0
}
