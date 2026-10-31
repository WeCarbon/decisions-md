import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

export interface ProjectEntry {
  name: string
  root: string
}

/**
 * `~/.decs/config.json` — the folders `decs bench` opens from anywhere.
 *
 * `DECS_HOME` moves it, which is what tests use so they never touch the
 * owner's real registry.
 */
export const DECS_HOME = process.env.DECS_HOME || join(homedir(), '.decs')
export const CONFIG_PATH = join(DECS_HOME, 'config.json')

/** Where the registry lived before `~/.decs`. Read as a fallback, never written. */
const LEGACY_PATH = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'decs', 'projects.json')

function readFrom(path: string): ProjectEntry[] | null {
  if (!existsSync(path)) return null
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { projects?: ProjectEntry[] }
  return (raw.projects ?? []).filter((p) => p && typeof p.root === 'string')
}

/** Never throws: a corrupt registry must not stop `decs bench` from opening. */
export function readProjects(): ProjectEntry[] {
  try {
    return readFrom(CONFIG_PATH) ?? (process.env.DECS_HOME ? [] : readFrom(LEGACY_PATH)) ?? []
  } catch {
    return []
  }
}

/** The slice of `node:path` `isScratchPath` needs — swappable so a test can
 *  drive the win32 table without actually running on Windows. */
export interface PathOps {
  resolve: (p: string) => string
  sep: string
}
const NATIVE_PATH_OPS: PathOps = { resolve, sep }

/** Temp directories are never registered as bench projects. */
export function isScratchPath(root: string, tmp = tmpdir(), ops: PathOps = NATIVE_PATH_OPS): boolean {
  const abs = ops.resolve(root)
  return [tmp, '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].some(
    (t) => abs === ops.resolve(t) || abs.startsWith(`${ops.resolve(t)}${ops.sep}`),
  )
}

/** The whole `config.json`, or `{}` when it is missing or unreadable. */
export function readUserConfig(): Record<string, unknown> {
  try {
    if (!existsSync(CONFIG_PATH)) return {}
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Merges into `config.json`, keeping keys this call does not name; `undefined` removes one. */
export function writeUserConfig(patch: Record<string, unknown>): void {
  const next: Record<string, unknown> = { ...readUserConfig() }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k]
    else next[k] = v
  }
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`)
}

export function writeProjects(projects: ProjectEntry[]): void {
  writeUserConfig({ projects })
}

export function addProject(root: string, name?: string): ProjectEntry[] {
  const abs = resolve(root)
  const entry: ProjectEntry = { name: name || basename(abs) || abs, root: abs }
  const rest = readProjects().filter((p) => resolve(p.root) !== abs)
  const next = [...rest, entry].sort((a, b) => a.name.localeCompare(b.name))
  writeProjects(next)
  return next
}

export function removeProject(rootOrName: string): ProjectEntry[] {
  const abs = resolve(rootOrName)
  const next = readProjects().filter((p) => resolve(p.root) !== abs && p.name !== rootOrName)
  writeProjects(next)
  return next
}
