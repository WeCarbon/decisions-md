import { Bot, CalendarClock, CornerLeftUp, Flame, GitFork, Link2, MessageSquare, Pin, PinOff, Plus, CheckCheck, Timer, User } from 'lucide-preact'
import type { ComponentChildren } from 'preact'
import { Bar, Glyph, segClass } from './segs.tsx'
import { s } from './strings.ts'
import type { Node, NodePill, Seg } from './types.ts'

const ICON = { size: 13, strokeWidth: 1.75 } as const

let rtf: Intl.RelativeTimeFormat | null = null
let rtfLang = ''
/** "5 min ago" in the window's language. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const lang = document.documentElement.lang || 'en'
  if (!rtf || rtfLang !== lang) {
    rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
    rtfLang = lang
  }
  const sec = Math.round((Date.parse(iso) - now) / 1000)
  const abs = Math.abs(sec)
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour')
  return rtf.format(Math.round(sec / 86400), 'day')
}

const fullTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(document.documentElement.lang || undefined) : '')

function Chip({ icon, children, title, tone }: { icon: ComponentChildren; children: ComponentChildren; title?: string; tone?: string }) {
  return (
    <span class={`mchip ${tone ?? ''}`} title={title}>
      {icon}
      <span class="mchip-text">{children}</span>
    </span>
  )
}

function Pills({ icon, label, nodes, onJump }: { icon: ComponentChildren; label: string; nodes: NodePill[]; onJump: (key: string) => void }) {
  if (!nodes.length) return null
  return (
    <span class="pills" title={label}>
      <span class="pills-icon" aria-label={label}>
        {icon}
      </span>
      {nodes.map((n, i) =>
        n.key ? (
          <button key={i} class="npill" onClick={() => onJump(n.key!)} title={n.title ?? ''}>
            <Glyph g={n.glyph ?? undefined} />
            <span class="npill-ref">{n.ref}</span>
            {nodes.length === 1 && n.title && <span class="npill-title">{n.title}</span>}
          </button>
        ) : (
          <span key={i} class="npill missing" title={label}>
            {n.ref}
          </span>
        ),
      )}
    </span>
  )
}

/** The status sentence decs prints, split: the state goes in the pill, the rest is its tooltip. */
function StatusPill({ segs }: { segs: Seg[] }) {
  const [glyph, label, ...rest] = segs
  const tone = glyph ? segClass({ ...glyph, dim: false }) : ''
  const detail = rest.map((x) => x.text.replace(/^\s*·\s*/, '')).join(' · ').trim()
  return (
    <span class={`spill ${tone}`} title={detail || undefined}>
      <Glyph g={glyph} />
      <span>{label?.text.trim()}</span>
      {detail && <span class="spill-detail">{detail}</span>}
    </span>
  )
}

interface Event {
  at: string
  kind: 'created' | 'agent' | 'human' | 'answer'
  who: string
  text: string
}

/** Created, then every note and answer, oldest first: a row of dots, each with its own tooltip. */
function Timeline({ n }: { n: Node }) {
  const events: Event[] = [{ at: n.created, kind: 'created', who: n.who, text: '' }]
  for (const note of n.notes ?? []) {
    const answer = /^(已答|Answered)/.test(note.kind)
    events.push({ at: note.at, kind: answer ? 'answer' : note.role === 'human' ? 'human' : 'agent', who: note.author.split(/\s*·\s*/)[0], text: note.text })
  }
  if (events.length < 2) return null
  const icon = (k: Event['kind']) =>
    k === 'created' ? <Plus {...ICON} /> : k === 'answer' ? <CheckCheck {...ICON} /> : k === 'human' ? <MessageSquare {...ICON} /> : <Bot {...ICON} />
  const last = events.at(-1)!
  return (
    <div class="timeline" aria-label="timeline">
      {events.map((e, i) => (
        <span key={i} class={`tl-dot tl-${e.kind}`} title={`${e.who} · ${fullTime(e.at)}${e.text ? `\n${e.text.slice(0, 160)}` : ''}`}>
          {icon(e.kind)}
        </span>
      ))}
      <span class="tl-last">{ago(last.at)}</span>
    </div>
  )
}

export function NodeHeader({ n, onJump }: { n: Node; onJump: (key: string) => void }) {
  const waitingSince = n.status === 'needs_decision' ? n.updated_at ?? n.created : null
  const steps = Array.isArray(n.steps) ? (n.steps as { label: string; done: boolean }[]) : []
  const next = steps.findIndex((x) => !x.done)
  const stale = n.staleness && n.staleness !== 'fresh'
  return (
    <header class="nhead">
      <div class="nhead-top">
        <span class="ref-pill">{n.ref}</span>
        <StatusPill segs={n.status_line} />
        {n.urgency === 'high' && (
          <Chip icon={<Flame {...ICON} />} tone="c-red">
            {s('urgentShort')}
          </Chip>
        )}
        {n.pin && <Chip icon={n.pin === 'top' ? <Pin {...ICON} /> : <PinOff {...ICON} />}>{n.pin === 'top' ? s('pinnedTop') : s('pinnedBottom')}</Chip>}
        {n.deferred_at && <Chip icon={<Timer {...ICON} />}>{s('deferred')}</Chip>}
      </div>
      <h2 class="node-title" dir="auto">
        {n.title}
      </h2>
      <div class="mchips">
        <Chip icon={<User {...ICON} />} title={n.author}>
          {n.who}
        </Chip>
        <Chip icon={<CalendarClock {...ICON} />} title={`${fullTime(n.created)}`} tone={stale ? 'c-red' : ''}>
          {ago(waitingSince ?? n.updated_at ?? n.created)}
        </Chip>
        {n.due && (
          <Chip icon={<Timer {...ICON} />} title={fullTime(n.due)} tone={Date.parse(n.due) < Date.now() ? 'c-red' : ''}>
            {ago(n.due)}
          </Chip>
        )}
        {n.parent_node && <Pills icon={<CornerLeftUp {...ICON} />} label={s('ctxGoParent')} nodes={[n.parent_node]} onJump={onJump} />}
        <Pills icon={<GitFork {...ICON} />} label={s('afterLabel')} nodes={n.after_nodes ?? []} onJump={onJump} />
        <Pills icon={<Link2 {...ICON} />} label={s('blockingLabel')} nodes={n.blocking_nodes ?? []} onJump={onJump} />
      </div>
      {(n.progress ?? 0) > 0 && (
        <div class="nprogress" title={n.progress_msg ?? undefined}>
          <Bar pct={n.progress!} color={stale ? 'red' : undefined} />
          <span class="np-pct">{n.progress}%</span>
          {n.progress_msg && <span class="np-msg">{n.progress_msg}</span>}
        </div>
      )}
      {steps.length > 0 && (
        <ol class="steps-list">
          {steps.map((st, i) => (
            <li key={i} class={st.done ? 'done' : i === next ? 'next' : ''}>
              <span class="st-mark">{st.done ? '✓' : i === next && n.status === 'in_progress' ? '◐' : '○'}</span>
              {st.label}
            </li>
          ))}
        </ol>
      )}
      <Timeline n={n} />
    </header>
  )
}
