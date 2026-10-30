import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { addProject, CONFIG_PATH, isScratchPath, readProjects, removeProject, writeProjects } from '../../core/config.ts'
import { layoutFor } from '../../core/paths.ts'
import { bool, one, type Args } from '../args.ts'
import { dim } from '../../core/render.ts'
import { t } from '../../i18n/index.ts'

export function run(args: Args): number {
  const [verb = 'list', target] = args._

  if (verb === 'add') {
    const root = resolve(target ?? process.cwd())
    if (!existsSync(layoutFor(root).activeDir)) throw new Error(t('cli.projects.noDecisions', { root }))
    addProject(root, one(args, 'name'))
    console.log(t('cli.projects.added', { root }))
    return 0
  }
  if (verb === 'rm' || verb === 'remove') {
    if (!target) throw new Error(t('cli.projects.whichProject'))
    removeProject(target)
    console.log(t('cli.projects.removed', { target }))
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
    console.log(JSON.stringify(projects))
    return 0
  }
  if (!projects.length) {
    console.log(t('cli.projects.none'))
    return 0
  }
  for (const p of projects) {
    const ok = existsSync(layoutFor(p.root).activeDir)
    console.log(`${p.name}  ${dim(p.root)}${ok ? '' : dim(`  ${t('cli.projects.decisionsGone')}`)}`)
  }
  console.log(dim(`\n${CONFIG_PATH}`))
  return 0
}
