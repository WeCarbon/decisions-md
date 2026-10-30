import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

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

/** Temp directories are never registered as bench projects. */
export function isScratchPath(root: string): boolean {
  const abs = resolve(root)
  return [tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].some(
    (t) => abs === t || abs.startsWith(`${resolve(t)}/`),
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
  const entry: ProjectEntry = { name: name ?? abs.split('/').filter(Boolean).pop() ?? abs, root: abs }
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
