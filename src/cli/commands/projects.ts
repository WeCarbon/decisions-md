import { existsSync, realpathSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { addProject, CONFIG_PATH, isScratchPath, readProjects, removeProject, writeProjects, type ProjectEntry } from '../../core/config.ts'
import { DEFAULT_LETTER, readProjectConfig } from '../../core/project.ts'
import { layoutFor } from '../../core/paths.ts'
import { bool, one, type Args } from '../args.ts'
import { dim } from '../../core/render.ts'
import { t } from '../../i18n/index.ts'

/** A registered project by its path, its registry name, its folder name or its display name. */
function findRegistered(target: string): ProjectEntry | undefined {
  const all = readProjects()
  // Through symlinks too: a path the store reports is canonical, the registry keeps what was typed.
  const real = (p: string) => (existsSync(p) ? realpathSync(p) : resolve(p))
  const abs = real(target)
  return (
    all.find((p) => real(p.root) === abs) ??
    all.find((p) => p.name === target || basename(p.root) === target) ??
    all.find((p) => displayOf(p) === target) ??
    all.find((p) => displayOf(p).toLowerCase() === target.toLowerCase())
  )
}

function displayOf(p: ProjectEntry): string {
  const l = layoutFor(p.root)
  return (existsSync(l.root) && readProjectConfig(l).name) || p.name
}

export function run(args: Args): number {
  const [verb = 'list', target] = args._

  if (verb === 'add') {
    const root = resolve(target ?? process.cwd())
    if (!existsSync(layoutFor(root).activeDir)) throw new Error(t('cli.projects.noDecisions', { root }))
    addProject(root, one(args, 'name'))
    console.log(t('cli.projects.added', { root }))
    return 0
  }
  if (verb === 'rm' || verb === 'remove' || verb === 'unlink') {
    if (!target) throw new Error(t('cli.projects.whichProject'))
    const entry = findRegistered(target)
    if (!entry) throw new Error(t('cli.projects.notRegistered', { target }))
    removeProject(entry.root)
    const shown = displayOf(entry)
    if (bool(args, 'json')) console.log(JSON.stringify({ removed: { name: shown, root: entry.root } }))
    else console.log(t('cli.projects.removedKeep', { name: shown, root: entry.root }))
    return 0
  }
  if (verb === 'prune') {
    // Folders that are gone, and lanes' scratch dirs registered by an older `decs init`.
    const all = readProjects()
    const keep = all.filter((p) => existsSync(layoutFor(p.root).activeDir) && !isScratchPath(p.root))
    for (const p of all.filter((x) => !keep.includes(x))) console.log(t('cli.projects.pruned', { name: p.name, root: dim(p.root) }))
    writeProjects(keep)
    return 0
  }
  if (verb !== 'list') throw new Error(t('cli.projects.unknownSubcommand', { verb }))

  const projects = readProjects()
  if (bool(args, 'json')) {
    console.log(
      JSON.stringify(
        projects.map((p) => {
          const l = layoutFor(p.root)
          const cfg = existsSync(l.root) ? readProjectConfig(l) : {}
          return { ...p, display_name: cfg.name ?? basename(p.root), letter: cfg.letter ?? DEFAULT_LETTER, former_letters: cfg.former_letters ?? [], exists: existsSync(l.activeDir) }
        }),
      ),
    )
    return 0
  }
  if (!projects.length) {
    console.log(t('cli.projects.none'))
    return 0
  }
  for (const p of projects) {
    const ok = existsSync(layoutFor(p.root).activeDir)
    console.log(`${displayOf(p)}  ${dim(p.root)}${ok ? '' : dim(`  ${t('cli.projects.decisionsGone')}`)}`)
  }
  console.log(dim(`\n${CONFIG_PATH}`))
  return 0
}
