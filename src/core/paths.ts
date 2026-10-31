import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * A relative markdown link target (attachment, `after`, a moved node's own
 * link) is committed text other OSes read too — always `/`, never the
 * host's own separator. Safe on Windows either way: its own file APIs
 * accept `/` exactly like `\`.
 */
export function toPosixPath(p: string, hostSep: string = sep): string {
  return hostSep === '/' ? p : p.split(hostSep).join('/')
}

export interface Layout {
  /** The directory that *contains* `decisions/` — i.e. the project root. */
  projectRoot: string
  /** `<projectRoot>/decisions` */
  root: string
  activeDir: string
  archivedDir: string
  /** Zero-byte id reservations; makes number allocation atomic across agents. */
  idsDir: string
}

/**
 * Normalises through symlinks so paths from different sources compare
 * equal — git answers with the real path, a `--dir` flag usually doesn't.
 */
function canonical(p: string): string {
  try {
    return realpathSync.native(p)
  } catch {
    return resolve(p)
  }
}

export function layoutFor(input: string): Layout {
  const projectRoot = canonical(input)
  const root = join(projectRoot, 'decisions')
  return {
    projectRoot,
    root,
    activeDir: join(root, 'active'),
    archivedDir: join(root, 'archived'),
    idsDir: join(root, '.ids'),
  }
}

/** The repository's main working tree, or null outside git. `--git-common-dir`
 *  finds the shared `.git` from any linked worktree. */
export function mainWorktree(cwd: string): string | null {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return common ? dirname(common) : null
  } catch {
    return null
  }
}

/**
 * Find the project whose decision list applies here. The main working tree
 * wins over a linked worktree's own checked-out copy of `decisions/`, since
 * nobody watches that copy; only outside git, or with none in the main
 * tree, do we walk up from cwd.
 */
export function findLayout(cwd = process.cwd()): Layout | null {
  const main = mainWorktree(resolve(cwd))
  if (main && existsSync(join(main, 'decisions', 'active'))) return layoutFor(main)

  let dir = resolve(cwd)
  for (;;) {
    if (existsSync(join(dir, 'decisions', 'active'))) return layoutFor(dir)
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function requireLayout(cwd = process.cwd()): Layout {
  const l = findLayout(cwd)
  if (!l) {
    throw new Error(
      'no decisions/ directory found here or in any parent.\n' +
        'Run `decs init` in the project root to create one.',
    )
  }
  return l
}

export function initLayout(projectRoot: string): Layout {
  const l = layoutFor(projectRoot)
  for (const d of [l.root, l.activeDir, l.archivedDir, l.idsDir]) mkdirSync(d, { recursive: true })
  return l
}

/** `305-slug.md`, and the older `D305-slug.md`. Both are read; new entries
 *  drop the D; `decs migrate --strip-prefix` renames the rest. */
export const ENTRY_NAME_RE = /^D?(\d+)(?:-(.*))?\.md$/
const ENTRY_RE = ENTRY_NAME_RE

/** The filename a new entry gets. */
export function entryFileName(id: number, slug: string): string {
  return slug ? `${id}-${slug}.md` : `${id}.md`
}

/** `attachments/D305/` if it already exists (old links keep resolving),
 *  otherwise `attachments/305/`. */
export function attachmentDir(l: Layout, id: number): string {
  const legacy = join(l.root, 'attachments', `D${id}`)
  return existsSync(legacy) ? legacy : join(l.root, 'attachments', String(id))
}

export interface EntryFile {
  id: number
  slug: string
  path: string
  /** Whether its root lives in archived/ — a whole subtree moves as one. */
  archived: boolean
  /** The node whose folder it sits in; absent for a root node. */
  parent?: number
  /** From the stat the walk already does — lets a reader skip re-parsing an unchanged file. */
  mtimeMs?: number
  size?: number
}

/** `305-slug/` (or `D305-slug/`): the folder holding node 305's children. */
const CHILD_DIR_RE = /^D?(\d+)(?:-.*)?$/

/** The folder a node's children live in: its file path without `.md`. */
export function childDirOf(file: string): string {
  return file.replace(/\.md$/, '')
}

/**
 * Every node file, the tree flattened. Children sit in the sibling folder
 * `305-slug/`; ids stay one flat space, so moving a node is a rename, not
 * a renumbering.
 */
export function listEntryFiles(l: Layout): EntryFile[] {
  const out: EntryFile[] = []
  const walk = (dir: string, archived: boolean, parent?: number) => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue // renamed away between readdir and stat
      }
      if (st.isDirectory()) {
        const m = CHILD_DIR_RE.exec(name)
        if (m) walk(p, archived, Number(m[1]))
        continue
      }
      const m = ENTRY_RE.exec(name)
      if (!m || !st.isFile()) continue
      out.push({
        id: Number(m[1]),
        slug: m[2] ?? '',
        path: p,
        archived,
        mtimeMs: st.mtimeMs,
        size: st.size,
        ...(parent !== undefined ? { parent } : {}),
      })
    }
  }
  walk(l.activeDir, false)
  walk(l.archivedDir, true)
  return out.sort((a, b) => a.id - b.id)
}
