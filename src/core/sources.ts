/**
 * External sources: an adapter (often a background Python process) polls an
 * issue tracker, mailbox or feedback form and syncs *references* — id +
 * title, optionally url/state/from — into `decisions/sources/<name>/`.
 * Never the full content or credentials.
 *
 *   decisions/sources/<name>/source.md    registration — committed
 *   decisions/sources/<name>/state.json   item state — gitignored
 *   decisions/sources/events.jsonl        append-only log — gitignored
 *
 * state.json and the events log use an O_EXCL lock (see `core/queue.ts`) so
 * concurrent adapter writes don't clobber each other.
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Layout } from './paths.ts'
import { nowStamp } from './store.ts'
import type { Store } from './store.ts'
import { t } from '../i18n/index.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceConfig {
  name: string
  title: string
  /** Free-form display label, e.g. "github" / "mail" / "feedback". */
  kind: string
  /** The command an agent runs in the background to keep this source fed. */
  adapter?: string
  /** `<agent> · <what it's doing>` — who is responsible for the adapter. */
  ownerAgent?: string
  created: string
  /** "15m" / "1h" / "30s" / "2d" — how long without a heartbeat before the adapter looks dead. */
  staleAfter: string
}

export interface SourceItem {
  id: string
  title: string
  url?: string
  state?: string
  /** Who/where it's from, e.g. a sender or an issue's assignee — metadata only. */
  from?: string
  firstSeen: string
  updatedAt: string
  handled: boolean
  handledBy?: string
  handledNote?: string
  /** `owner` | `us` | a person's name | a ref like `W304`/`D304`/`304` —
   *  see `parseWaitingOnRef`. Stored exactly as given; never rewritten. */
  waitingOn?: string
  /** Missing from the most recent full `sync` — the external item disappeared. */
  gone?: boolean
  goneAt?: string
}

export interface SourceStateFile {
  heartbeatAt?: string
  items: Record<string, SourceItem>
}

export interface SourceEvent {
  at: string
  source: string
  kind: 'new' | 'changed' | 'gone'
  id: string
  title: string
  url?: string
  state?: string
}

export interface SourceEventWithProject extends SourceEvent {
  project: string
  projectLetter: string
}

/** What an adapter hands `sync`/`push` — the only shape it is allowed to carry. */
export interface IncomingItem {
  id: string
  title: string
  url?: string
  state?: string
  from?: string
}

export interface SyncResult {
  new: SourceItem[]
  changed: SourceItem[]
  gone: SourceItem[]
  unchanged: number
}

export interface SourceSummary {
  project: string
  projectLetter: string
  name: string
  title: string
  kind: string
  ownerAgent?: string
  adapter?: string
  /** Non-deleted items known about. */
  total: number
  unhandled: number
  /** Among undone items, grouped by where the ball is: `unhandled`, `owner`, `us`, or a name. */
  buckets: Record<string, number>
  heartbeatAt?: string
  heartbeatAgeMs?: number
  /** No heartbeat within `staleAfter` — the adapter is probably dead. */
  stale: boolean
  /** No unhandled items, and nothing parked on `owner`/`us`/an open node ref. */
  cleared: boolean
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function sourcesRootOf(layout: Layout): string {
  return join(layout.root, 'sources')
}

export function sourceDirOf(layout: Layout, name: string): string {
  return join(sourcesRootOf(layout), name)
}

const configPath = (l: Layout, name: string) => join(sourceDirOf(l, name), 'source.md')
const statePath = (l: Layout, name: string) => join(sourceDirOf(l, name), 'state.json')
const stateLockPath = (l: Layout, name: string) => join(sourceDirOf(l, name), '.state.lock')
const eventsPath = (l: Layout) => join(sourcesRootOf(l), 'events.jsonl')
const eventsLockPath = (l: Layout) => join(sourcesRootOf(l), '.events.lock')

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

export function validateSourceName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error(t('core.sources.badName', { name }))
  }
}

// A small O_EXCL lock, same shape as `core/queue.ts`'s, kept local on purpose.
// ---------------------------------------------------------------------------

function withLock<T>(lockPath: string, lockDir: string, fn: () => T): T {
  mkdirSync(lockDir, { recursive: true })
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      closeSync(openSync(lockPath, 'wx'))
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      if (Date.now() > deadline) {
        // A crashed process can leave the lock behind; proceeding after five
        // seconds beats wedging every adapter on the machine.
        rmSync(lockPath, { force: true })
        continue
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  try {
    return fn()
  } finally {
    rmSync(lockPath, { force: true })
  }
}

function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tmp, path)
}

// ---------------------------------------------------------------------------
// waiting_on — one function every interpretation of the value goes through
// ---------------------------------------------------------------------------

export interface WaitingOnRef {
  raw: string
  kind: 'owner' | 'us' | 'ref' | 'person'
  /** Project-letter prefix, if any (e.g. "W" in "W304"; legacy "D304" too). */
  projectLetter?: string
  /** The item number in a ref like "W304" / "D304" / "304". */
  refId?: number
}

const WAITING_ON_REF_RE = /^([A-Z])?(\d+)$/

/**
 * Parses a `waiting_on` value: the literals `owner`/`us`, a person's name, or
 * a node ref (`<project-letter><number>`, or legacy bare `D304`/`304`).
 * Read-only interpretation — the value is always stored exactly as given.
 */
export function parseWaitingOnRef(raw: string): WaitingOnRef {
  if (raw === 'owner') return { raw, kind: 'owner' }
  if (raw === 'us') return { raw, kind: 'us' }
  const m = WAITING_ON_REF_RE.exec(raw)
  if (m) return { raw, kind: 'ref', projectLetter: m[1], refId: Number(m[2]) }
  return { raw, kind: 'person' }
}

/**
 * Whether a `waiting_on` value should still block "cleared" even on an item
 * marked `handled` — a still-open node reference means something is still
 * unresolved somewhere else, even though our own part is done.
 */
export function waitingOnBlocks(raw: string | undefined): boolean {
  if (!raw) return false
  const kind = parseWaitingOnRef(raw).kind
  return kind === 'owner' || kind === 'us' || kind === 'ref'
}

/** Groups a `waiting_on` value for the per-source bucket counts. A node
 *  reference or a person's name is shown as-is — decisions and tasks are one
 *  kind of node sharing one id space, so there is nothing finer to bucket by;
 *  the bucket is just the reference itself. */
export function waitingOnBucket(raw: string | undefined): string {
  if (!raw) return 'unhandled'
  const ref = parseWaitingOnRef(raw)
  if (ref.kind === 'owner' || ref.kind === 'us') return ref.kind
  return raw
}

// Project letter — `decisions/decs.json` → `{ "letter": "W" }`, default "X".
// ---------------------------------------------------------------------------

export function projectLetterOf(layout: Layout): string {
  try {
    const raw = JSON.parse(readFileSync(join(layout.root, 'decs.json'), 'utf8')) as { letter?: unknown }
    if (typeof raw.letter === 'string' && raw.letter.trim()) return raw.letter.trim()
  } catch {
    /* no decs.json, or not JSON — default */
  }
  return 'X'
}

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

const DURATION_RE = /^(\d+)(s|m|h|d)$/

/** Strict — for validating `--stale-after` at the CLI boundary. */
export function normalizeDuration(raw: string): string {
  const s = raw.trim()
  if (!DURATION_RE.test(s)) throw new Error(t('core.sources.badDuration', { value: raw }))
  return s
}

/** Forgiving — a hand-edited or stale config should not crash a read. */
export function parseDurationMs(raw: string | undefined, fallbackMs = 15 * 60_000): number {
  const m = raw ? DURATION_RE.exec(raw.trim()) : null
  if (!m) return fallbackMs
  const n = Number(m[1])
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd']
  return n * mult
}

// ---------------------------------------------------------------------------
// source.md — registration
// ---------------------------------------------------------------------------

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/

function parseSourceConfig(text: string, fallbackName: string): { config: SourceConfig; body: string } {
  const m = FM_RE.exec(text)
  let data: Record<string, unknown> = {}
  let body = text
  if (m) {
    const parsed = parseYaml(m[1]) as unknown
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
    body = text.slice(m[0].length)
  }
  const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v))
  return {
    config: {
      name: str(data.name) ?? fallbackName,
      title: str(data.title) ?? fallbackName,
      kind: str(data.kind) ?? 'generic',
      adapter: str(data.adapter),
      ownerAgent: str(data.owner_agent),
      created: str(data.created) ?? '',
      staleAfter: str(data.stale_after) ?? '15m',
    },
    body: body.trim(),
  }
}

function serializeSourceConfig(cfg: SourceConfig, body: string): string {
  const fm: Record<string, unknown> = {
    name: cfg.name,
    title: cfg.title,
    kind: cfg.kind,
    created: cfg.created,
    stale_after: cfg.staleAfter,
  }
  if (cfg.adapter) fm.adapter = cfg.adapter
  if (cfg.ownerAgent) fm.owner_agent = cfg.ownerAgent
  const yaml = stringifyYaml(fm, { lineWidth: 0, defaultKeyType: 'PLAIN' })
  const b = body.trim()
  return `---\n${yaml}---\n${b ? `\n${b}\n` : '\n'}`
}

export function readSourceConfig(layout: Layout, name: string): SourceConfig | null {
  try {
    return parseSourceConfig(readFileSync(configPath(layout, name), 'utf8'), name).config
  } catch {
    return null
  }
}

export interface RegisterInput {
  name: string
  title?: string
  kind?: string
  adapter?: string
  ownerAgent?: string
  staleAfter?: string
  notes?: string
}

/** Registers or updates a source. Updates are partial — an omitted field keeps its old value. */
export function registerSource(layout: Layout, input: RegisterInput): SourceConfig {
  validateSourceName(input.name)
  const dir = sourceDirOf(layout, input.name)
  mkdirSync(dir, { recursive: true })

  let existing: { config: SourceConfig; body: string } | null = null
  try {
    existing = parseSourceConfig(readFileSync(configPath(layout, input.name), 'utf8'), input.name)
  } catch {
    /* first registration */
  }

  const cfg: SourceConfig = {
    name: input.name,
    title: (input.title?.trim() || existing?.config.title) ?? input.name,
    kind: input.kind?.trim() || existing?.config.kind || 'generic',
    adapter: input.adapter ?? existing?.config.adapter,
    ownerAgent: input.ownerAgent ?? existing?.config.ownerAgent,
    created: existing?.config.created || nowStamp(),
    staleAfter: input.staleAfter ? normalizeDuration(input.staleAfter) : existing?.config.staleAfter || '15m',
  }
  const body = input.notes ?? existing?.body ?? ''
  writeFileSync(configPath(layout, input.name), serializeSourceConfig(cfg, body))
  return cfg
}

export function listSourceNames(layout: Layout): string[] {
  const dir = sourcesRootOf(layout)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() && existsSync(join(p, 'source.md'))
    })
    .sort()
}

function requireRegistered(layout: Layout, name: string): SourceConfig {
  const cfg = readSourceConfig(layout, name)
  if (!cfg) throw new Error(t('core.sources.notRegistered', { name }))
  return cfg
}

// ---------------------------------------------------------------------------
// state.json — item state
// ---------------------------------------------------------------------------

function readStateRaw(layout: Layout, name: string): SourceStateFile {
  try {
    const raw = JSON.parse(readFileSync(statePath(layout, name), 'utf8')) as Partial<SourceStateFile>
    const items: Record<string, SourceItem> = {}
    if (raw.items && typeof raw.items === 'object') {
      for (const [id, v] of Object.entries(raw.items as Record<string, Partial<SourceItem>>)) {
        if (!v || typeof v !== 'object') continue
        items[id] = {
          id: String(v.id ?? id),
          title: String(v.title ?? ''),
          url: v.url ? String(v.url) : undefined,
          state: v.state ? String(v.state) : undefined,
          from: v.from ? String(v.from) : undefined,
          firstSeen: String(v.firstSeen ?? ''),
          updatedAt: String(v.updatedAt ?? ''),
          handled: Boolean(v.handled),
          handledBy: v.handledBy ? String(v.handledBy) : undefined,
          handledNote: v.handledNote ? String(v.handledNote) : undefined,
          waitingOn: v.waitingOn ? String(v.waitingOn) : undefined,
          gone: Boolean(v.gone),
          goneAt: v.goneAt ? String(v.goneAt) : undefined,
        }
      }
    }
    return { heartbeatAt: typeof raw.heartbeatAt === 'string' ? raw.heartbeatAt : undefined, items }
  } catch {
    return { items: {} } // missing/corrupt state is rebuilt on next write
  }
}

/** Read-modify-write under an exclusive per-source lock. */
function withSourceState<T>(
  layout: Layout,
  name: string,
  mutate: (s: SourceStateFile) => { state: SourceStateFile; result: T },
): T {
  const dir = sourceDirOf(layout, name)
  mkdirSync(dir, { recursive: true })
  return withLock(stateLockPath(layout, name), dir, () => {
    const { state, result } = mutate(readStateRaw(layout, name))
    writeJsonAtomic(statePath(layout, name), state)
    return result
  })
}

export function readSourceState(layout: Layout, name: string): SourceStateFile {
  return readStateRaw(layout, name)
}

function mkEvent(source: string, kind: SourceEvent['kind'], item: SourceItem, at: string): SourceEvent {
  return { at, source, kind, id: item.id, title: item.title, url: item.url, state: item.state }
}

function appendSourceEvents(layout: Layout, events: SourceEvent[]): void {
  if (!events.length) return
  const dir = sourcesRootOf(layout)
  mkdirSync(dir, { recursive: true })
  withLock(eventsLockPath(layout), dir, () => {
    appendFileSync(eventsPath(layout), events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  })
}

function contentChanged(prev: SourceItem, inc: IncomingItem): boolean {
  return prev.title !== inc.title || prev.url !== inc.url || prev.state !== inc.state || prev.from !== inc.from
}

/** A changed/revived item starts triage over — old decisions no longer apply. */
function freshenOnChange(prev: SourceItem, inc: IncomingItem, now: string): SourceItem {
  return {
    ...prev,
    title: inc.title,
    url: inc.url,
    state: inc.state,
    from: inc.from,
    updatedAt: now,
    handled: false,
    handledBy: undefined,
    handledNote: undefined,
    waitingOn: undefined,
    gone: false,
    goneAt: undefined,
  }
}

/** A full snapshot; items missing from `incoming` are marked `gone`, not deleted. */
export function syncSourceItems(layout: Layout, name: string, incoming: IncomingItem[]): SyncResult {
  requireRegistered(layout, name)
  const now = nowStamp(new Date(), { ms: true })
  let out: SyncResult = { new: [], changed: [], gone: [], unchanged: 0 }
  let events: SourceEvent[] = []

  withSourceState(layout, name, (s) => {
    const items: Record<string, SourceItem> = { ...s.items }
    const incomingIds = new Set<string>()
    const localNew: SourceItem[] = []
    const localChanged: SourceItem[] = []
    const localGone: SourceItem[] = []
    let unchanged = 0

    for (const inc of incoming) {
      const id = String(inc.id)
      incomingIds.add(id)
      const prev = items[id]
      if (!prev) {
        const item: SourceItem = {
          id,
          title: inc.title,
          url: inc.url,
          state: inc.state,
          from: inc.from,
          firstSeen: now,
          updatedAt: now,
          handled: false,
        }
        items[id] = item
        localNew.push(item)
        continue
      }
      if (!contentChanged(prev, inc) && !prev.gone) {
        unchanged++
        continue
      }
      const item = freshenOnChange(prev, inc, now)
      items[id] = item
      localChanged.push(item)
    }
    for (const id of Object.keys(items)) {
      if (incomingIds.has(id) || items[id].gone) continue
      const item: SourceItem = { ...items[id], gone: true, goneAt: now }
      items[id] = item
      localGone.push(item)
    }

    out = { new: localNew, changed: localChanged, gone: localGone, unchanged }
    events = [
      ...localNew.map((i) => mkEvent(name, 'new', i, now)),
      ...localChanged.map((i) => mkEvent(name, 'changed', i, now)),
      ...localGone.map((i) => mkEvent(name, 'gone', i, now)),
    ]
    return { state: { heartbeatAt: now, items }, result: undefined }
  })

  appendSourceEvents(layout, events)
  return out
}

/** One item at a time — for an adapter that gets pushed updates rather than polling a full list. */
export function pushSourceItem(
  layout: Layout,
  name: string,
  incoming: IncomingItem,
): { kind: 'new' | 'changed' | 'unchanged'; item: SourceItem } {
  requireRegistered(layout, name)
  const now = nowStamp(new Date(), { ms: true })
  let kind: 'new' | 'changed' | 'unchanged' = 'unchanged'
  let resultItem!: SourceItem
  let event: SourceEvent | undefined

  withSourceState(layout, name, (s) => {
    const items = { ...s.items }
    const id = String(incoming.id)
    const prev = items[id]
    if (!prev) {
      resultItem = { id, title: incoming.title, url: incoming.url, state: incoming.state, from: incoming.from, firstSeen: now, updatedAt: now, handled: false }
      items[id] = resultItem
      kind = 'new'
      event = mkEvent(name, 'new', resultItem, now)
    } else if (!contentChanged(prev, incoming) && !prev.gone) {
      resultItem = prev
      kind = 'unchanged'
    } else {
      resultItem = freshenOnChange(prev, incoming, now)
      items[id] = resultItem
      kind = 'changed'
      event = mkEvent(name, 'changed', resultItem, now)
    }
    return { state: { heartbeatAt: now, items }, result: undefined }
  })

  if (event) appendSourceEvents(layout, [event])
  return { kind, item: resultItem }
}

export function heartbeatSource(layout: Layout, name: string): string {
  requireRegistered(layout, name)
  const now = nowStamp(new Date(), { ms: true })
  withSourceState(layout, name, (s) => ({ state: { ...s, heartbeatAt: now }, result: undefined }))
  return now
}

export interface AckOptions {
  by: string
  note?: string
  waitingOn?: string
}

/** Marks items handled and optionally records `waitingOn` (stored as-is, see `parseWaitingOnRef`). */
export function ackSourceItems(layout: Layout, name: string, ids: string[], opts: AckOptions): SourceItem[] {
  requireRegistered(layout, name)
  if (!ids.length) throw new Error(t('core.sources.ackNeedsIds'))
  const now = nowStamp(new Date(), { ms: true })
  let acked: SourceItem[] = []
  let missing: string[] = []

  withSourceState(layout, name, (s) => {
    const items = { ...s.items }
    acked = []
    missing = []
    for (const rawId of ids) {
      const id = String(rawId)
      const prev = items[id]
      if (!prev) {
        missing.push(id)
        continue
      }
      const item: SourceItem = {
        ...prev,
        handled: true,
        handledBy: opts.by,
        handledNote: opts.note,
        waitingOn: opts.waitingOn,
        updatedAt: now,
      }
      items[id] = item
      acked.push(item)
    }
    return { state: { ...s, items }, result: undefined }
  })

  if (missing.length) throw new Error(t('core.sources.noSuchIds', { name, ids: missing.join(', ') }))
  return acked
}

// ---------------------------------------------------------------------------
// Events log
// ---------------------------------------------------------------------------

export function readSourceEvents(layout: Layout): SourceEvent[] {
  const p = eventsPath(layout)
  if (!existsSync(p)) return []
  const out: SourceEvent[] = []
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t) as SourceEvent)
    } catch {
      /* a half-written line at the very end; decs check could flag this one day */
    }
  }
  return out
}

/** Every event across every project in the store, newer than `sinceIso` (exclusive). */
export function sourceEventsSince(
  store: Pick<Store, 'layouts' | 'projectName'>,
  sinceIso: string | undefined,
  opts: { name?: string } = {},
): SourceEventWithProject[] {
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN
  const out: SourceEventWithProject[] = []
  for (const layout of store.layouts) {
    const project = store.projectName(layout)
    const projectLetter = projectLetterOf(layout)
    for (const e of readSourceEvents(layout)) {
      if (opts.name && e.source !== opts.name) continue
      if (!Number.isNaN(sinceMs) && Date.parse(e.at) <= sinceMs) continue
      out.push({ ...e, project, projectLetter })
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

// ---------------------------------------------------------------------------
// Summaries — the pure functions the bench lane wires into `decs changes`/`decs wait`
// ---------------------------------------------------------------------------

export function isCleared(items: SourceItem[]): boolean {
  return items.every((i) => i.handled && !waitingOnBlocks(i.waitingOn))
}

function summaryBuckets(items: SourceItem[]): Record<string, number> {
  const buckets: Record<string, number> = {}
  for (const i of items) {
    if (i.handled && !waitingOnBlocks(i.waitingOn)) continue // fully done, not in any bucket
    const key = waitingOnBucket(i.waitingOn)
    buckets[key] = (buckets[key] ?? 0) + 1
  }
  return buckets
}

/** Per-source summaries across every project in the store — what `decs source list` prints. */
export function listSources(store: Pick<Store, 'layouts' | 'projectName'>, now = Date.now()): SourceSummary[] {
  const out: SourceSummary[] = []
  for (const layout of store.layouts) {
    const projectLetter = projectLetterOf(layout)
    const project = store.projectName(layout)
    for (const name of listSourceNames(layout)) {
      const cfg = readSourceConfig(layout, name)
      if (!cfg) continue
      const state = readSourceState(layout, name)
      const items = Object.values(state.items)
      const staleMs = parseDurationMs(cfg.staleAfter)
      const hbAgeMs = state.heartbeatAt ? now - Date.parse(state.heartbeatAt) : undefined
      const createdAgeMs = now - (Date.parse(cfg.created) || now)
      const stale = hbAgeMs !== undefined ? hbAgeMs > staleMs : createdAgeMs > staleMs

      out.push({
        project,
        projectLetter,
        name,
        title: cfg.title,
        kind: cfg.kind,
        ownerAgent: cfg.ownerAgent,
        adapter: cfg.adapter,
        total: items.length,
        unhandled: items.filter((i) => !i.handled).length,
        buckets: summaryBuckets(items),
        heartbeatAt: state.heartbeatAt,
        heartbeatAgeMs: hbAgeMs,
        stale,
        cleared: isCleared(items),
      })
    }
  }
  return out
}

/** Every unhandled item across the sources `name` resolves to (all of them, if omitted). */
export function unhandledSourceItems(
  store: Pick<Store, 'layouts' | 'projectName'>,
  name?: string,
): { project: string; projectLetter: string; name: string; item: SourceItem }[] {
  const out: { project: string; projectLetter: string; name: string; item: SourceItem }[] = []
  for (const layout of store.layouts) {
    const project = store.projectName(layout)
    const projectLetter = projectLetterOf(layout)
    const names = name ? listSourceNames(layout).filter((n) => n === name) : listSourceNames(layout)
    for (const n of names) {
      for (const item of Object.values(readSourceState(layout, n).items)) {
        if (!item.handled) out.push({ project, projectLetter, name: n, item })
      }
    }
  }
  return out
}

/** Finds which layout(s) in the store have `name` registered. */
export function findSourceLayouts(store: Pick<Store, 'layouts'>, name: string): Layout[] {
  return store.layouts.filter((l) => readSourceConfig(l, name) !== null)
}

// ---------------------------------------------------------------------------
// The JSON-lines protocol `decs source sync` reads from stdin
// ---------------------------------------------------------------------------

/**
 * One JSON object per line, only `id`/`title` required. Blank lines are
 * skipped; a malformed line throws naming its line number.
 */
export function parseIncomingItemsJsonl(text: string): IncomingItem[] {
  const out: IncomingItem[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch (e) {
      throw new Error(t('core.sources.badJsonLine', { line: i + 1, message: (e as Error).message }))
    }
    if (!obj || typeof obj !== 'object') throw new Error(t('core.sources.notAJsonObject', { line: i + 1 }))
    const o = obj as Record<string, unknown>
    if (o.id === undefined || o.id === null || String(o.id).trim() === '') throw new Error(t('core.sources.missingField', { line: i + 1, field: 'id' }))
    if (o.title === undefined || o.title === null) throw new Error(t('core.sources.missingField', { line: i + 1, field: 'title' }))
    out.push({
      id: String(o.id),
      title: String(o.title),
      url: o.url !== undefined && o.url !== null ? String(o.url) : undefined,
      state: o.state !== undefined && o.state !== null ? String(o.state) : undefined,
      from: o.from !== undefined && o.from !== null ? String(o.from) : undefined,
    })
  }
  return out
}
