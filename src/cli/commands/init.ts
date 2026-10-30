import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addProject, isScratchPath } from '../../core/config.ts'
import { initLayout } from '../../core/paths.ts'
import { writeProjectConfig } from '../../core/project.ts'
import { bool, one, type Args } from '../args.ts'
import { t } from '../../i18n/index.ts'

// Screenshots and adapter runtime state are gitignored; `source.md` (the
// registration) isn't — it's meant to be committed, like a decision file.
const GITIGNORE_LINES = [
  'attachments/',
  '.locks/',
  'sources/*/state.json',
  'sources/*/*.lock',
  'sources/*/*.tmp',
  'sources/events.jsonl',
  'sources/*.lock',
]

/** Adds missing lines without touching anything a human added by hand. */
function ensureGitignoreLines(path: string, lines: string[]): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : []
  const have = new Set(existing.map((l) => l.trim()).filter(Boolean))
  const missing = lines.filter((l) => !have.has(l))
  if (!missing.length) return
  const base = existing.join('\n').replace(/\s+$/, '')
  writeFileSync(path, `${base ? `${base}\n` : ''}${missing.join('\n')}\n`)
}

const README = `# decisions/

One markdown file per decision. \`active/\` is what the owner still owes an
answer on; \`archived/\` is everything already answered, kept forever.

Do not hand-edit \`.ids/\` — those zero-byte files are how concurrent agents
hand out numbers without colliding.

    decs send "<标题>" --option 1="..." 2="..."   # ask
    decs show                                     # what is waiting
    decs bench                                    # answer them
`

export function run(args: Args): number {
  const root = resolve(one(args, 'dir', 'd') ?? args._[0] ?? process.cwd())
  const l = initLayout(root)
  const readme = join(l.root, 'README.md')
  if (!existsSync(readme)) writeFileSync(readme, README)
  const ignore = join(l.root, '.gitignore')
  ensureGitignoreLines(ignore, GITIGNORE_LINES)
  console.log(t('cli.init.created', { root: l.root }))
  const letter = one(args, 'letter')
  if (letter) {
    writeProjectConfig(l, { letter: letter.toUpperCase() })
    console.log(t('cli.config.letterSet', { letter: letter.toUpperCase() }))
  }
  if (!bool(args, 'no-register') && !isScratchPath(root)) {
    addProject(root)
    console.log(t('cli.init.registered', { root }))
  }
  return 0
}
