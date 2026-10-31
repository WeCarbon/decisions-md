import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import * as api from './backend.ts'
import { Body } from './body.tsx'
import { Bar, Glyph, Segs } from './segs.tsx'
import { hiddenCount, isSelectable, nodeCollapsed, reveal, visibleRows, type Folds } from './rows.ts'
import { s } from './strings.ts'
import type { Bench as BenchData, Node, Row, View, ViewName } from './types.ts'

export interface Prefs {
  view: ViewName
  selected: string | null
  folds: Folds
  onboarded: boolean
}

type Composer =
  | { kind: 'answer'; key: string }
  | { kind: 'free' }
  | { kind: 'reply' }
  | null

const VIEW_ICON: Record<ViewName, string> = {
  available: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z',
  active: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1.5v10a5 5 0 0 1 0-10Z',
  decide: 'M8 1.8 14.2 8 8 14.2 1.8 8Z',
  all: 'M2.5 3.5h11v2h-11zm0 3.5h11v2h-11zm0 3.5h11v2h-11z',
  waiting: 'M5 3h2v10H5zm4 0h2v10H9z',
}

function useToast(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }, [])
  return [msg, show]
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))
}

export function Bench(props: {
  bench: BenchData
  prefs: Prefs
  setPrefs: (p: Partial<Prefs>) => void
  refresh: () => Promise<void>
  refreshing: boolean
  onAddProject: () => void
}) {
  const { bench, prefs, setPrefs, refresh } = props
  const view = bench.views.find((v) => v.view === prefs.view) ?? bench.views[0]
  const rows = useMemo(() => visibleRows(view, prefs.folds), [view, prefs.folds])
  const [composer, setComposer] = useState<Composer>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, showToast] = useToast()
  const detailRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectable = rows.filter(isSelectable)
  const index = Math.max(0, selectable.findIndex((r) => r.key === prefs.selected))
  const current: Row | undefined = selectable.find((r) => r.key === prefs.selected) ?? selectable[0]
  const node: Node | undefined = current?.kind === 'node' ? bench.nodes[current.node!] : undefined
  const rootOf = (n: Node) => bench.projects.find((p) => p.project === n.project)?.root ?? ''

  useEffect(() => {
    if (current && current.key !== prefs.selected) setPrefs({ selected: current.key })
  }, [current?.key])

  useEffect(() => {
    setComposer(null)
    setDraft('')
    detailRef.current?.scrollTo({ top: 0 })
  }, [node?.key])

  useLayoutEffect(() => {
    listRef.current?.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' })
  }, [prefs.selected, prefs.view])

  const select = (key: string) => setPrefs({ selected: key })
  const move = (delta: number) => {
    if (!selectable.length) return
    const next = selectable[Math.max(0, Math.min(selectable.length - 1, index + delta))]
    select(next.key)
  }
  const switchView = (v: ViewName) => setPrefs({ view: v })
  const cycleView = (delta: number) => {
    const i = bench.views.findIndex((v) => v.view === view.view)
    switchView(bench.views[(i + delta + bench.views.length) % bench.views.length].view)
  }
  const setFold = (r: Row, open: boolean) => {
    if (r.kind === 'fold') setPrefs({ folds: { ...prefs.folds, groups: { ...prefs.folds.groups, [r.key]: open } } })
    else if (r.has_kids) setPrefs({ folds: { ...prefs.folds, nodes: { ...prefs.folds.nodes, [r.key]: !open } } })
  }
  const isOpen = (r: Row) => (r.kind === 'fold' ? Boolean(prefs.folds.groups[r.key]) : !nodeCollapsed(r, prefs.folds))

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setComposer(null)
      setDraft('')
      showToast(done)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const canAnswer = (n: Node) => !n.terminal && (n.options.length > 0 || n.status === 'needs_decision')
  const startAnswer = (key: string) => {
    if (!node || !canAnswer(node)) return
    if (node.questions.length) {
      if (key === '1') return act(() => api.answerDefaults(rootOf(node), node.id), s('sent'))
      return detailRef.current?.querySelector<HTMLButtonElement>('.question .pick')?.focus()
    }
    if (!node.options.some((o) => o.key === key)) return
    setComposer({ kind: 'answer', key })
    setDraft('')
  }
  const send = () => {
    if (!node || !composer) return
    const root = rootOf(node)
    if (composer.kind === 'answer') return act(() => api.answer(root, node.id, composer.key, draft.trim() || undefined), s('sent'))
    if (composer.kind === 'free' && draft.trim()) return act(() => api.answerFreeText(root, node.id, draft.trim()), s('sent'))
    if (composer.kind === 'reply' && draft.trim()) return act(() => api.reply(root, node.id, draft.trim()), s('replied'))
  }
  const toggleDefer = () => {
    if (!node || node.terminal) return
    const off = Boolean(node.deferred_at)
    act(() => api.defer(rootOf(node), node.id, off), off ? s('undeferred') : s('deferred'))
  }
  const nextStuck = () => {
    const decide = bench.views.find((v) => v.view === 'decide')!
    const stuck = decide.rows.filter((r) => r.kind === 'node' && r.glyph?.bold)
    if (!stuck.length) return
    const after = stuck.findIndex((r) => r.key === prefs.selected)
    const target = stuck[(after + 1) % stuck.length]
    jump(target.node!)
  }
  const jump = (nodeKey: string) => {
    for (const v of [view, ...bench.views.filter((x) => x !== view && x.view === 'all')]) {
      const folds = reveal(bench, v, nodeKey, prefs.folds)
      if (folds) {
        setPrefs({ view: v.view, folds, selected: nodeKey })
        return
      }
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox !== null) return setLightbox(null)
        if (palette) return setPalette(false)
        if (help) return setHelp(false)
        if (composer) {
          setComposer(null)
          ;(document.activeElement as HTMLElement | null)?.blur()
          return
        }
        setError(null)
        return
      }
      if (palette || isTyping(e)) return
      if (lightbox !== null) {
        if (!node) return
        if (e.key === 'ArrowRight') setLightbox((i) => Math.min(node.images.length - 1, (i ?? 0) + 1))
        if (e.key === 'ArrowLeft') setLightbox((i) => Math.max(0, (i ?? 0) - 1))
        return
      }
      if (help) return setHelp(false)
      const meta = e.metaKey || e.ctrlKey
      if (meta && /^[1-5]$/.test(e.key)) {
        e.preventDefault()
        return switchView(bench.views[Number(e.key) - 1].view)
      }
      if (meta && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        return void refresh()
      }
      if (meta && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        return props.onAddProject()
      }
      if (meta || e.altKey) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          return move(1)
        case 'ArrowUp':
          e.preventDefault()
          return move(-1)
        case 'ArrowRight':
          e.preventDefault()
          if (current && !isOpen(current)) setFold(current, true)
          else move(1)
          return
        case 'ArrowLeft':
          e.preventDefault()
          if (current && (current.has_kids || current.kind === 'fold') && isOpen(current)) return setFold(current, false)
          if (node?.parent != null) {
            const pk = `${node.project}#${node.parent}`
            if (rows.some((r) => r.key === pk)) select(pk)
          }
          return
        case 'Tab':
          e.preventDefault()
          return cycleView(e.shiftKey ? -1 : 1)
        case 'Enter':
          e.preventDefault()
          if (current?.kind === 'fold') return setFold(current, !isOpen(current))
          if (node?.can_default && node.default) return startAnswer(node.default)
          if (node && node.status === 'needs_decision' && !node.options.length && !node.questions.length) setComposer({ kind: 'free' })
          return
        case '+':
        case '=':
          return current && setFold(current, true)
        case '-':
          return current && setFold(current, false)
        case 'j':
          return detailRef.current?.scrollBy({ top: 80, behavior: 'smooth' })
        case 'k':
          return detailRef.current?.scrollBy({ top: -80, behavior: 'smooth' })
        case 'd':
          return toggleDefer()
        case 'g':
        case ':':
          e.preventDefault()
          return setPalette(true)
        case 'w':
          return nextStuck()
        case 'N':
        case 'n':
        case 'r':
          e.preventDefault()
          if (node) setComposer({ kind: 'reply' })
          return
        case '?':
          return setHelp(true)
      }
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        startAnswer(e.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div class="shell">
      <aside class="sidebar">
        <div class="drag" data-tauri-drag-region />
        <nav>
          <div class="section-label">{s('views')}</div>
          {bench.views.map((v, i) => (
            <button key={v.view} class={`nav-item ${v.view === view.view ? 'on' : ''}`} onClick={() => switchView(v.view)} title={`⌘${i + 1}`}>
              <svg viewBox="0 0 16 16" class={`ico ico-${v.view}`}>
                <path d={VIEW_ICON[v.view]} />
              </svg>
              <span class="label">{v.label}</span>
              {v.count !== null && v.count > 0 && <span class={`count ${v.view === 'decide' ? 'hot' : ''}`}>{v.count}</span>}
            </button>
          ))}
          <div class="section-label">{s('projects')}</div>
          {bench.projects.map((p) => (
            <div key={p.project} class="project" title={p.root}>
              <span class="letter">{p.letter}</span>
              <span class="label">{p.project}</span>
            </div>
          ))}
          <button class="nav-item add" onClick={props.onAddProject}>
            <svg viewBox="0 0 16 16" class="ico">
              <path d="M7.25 3h1.5v4.25H13v1.5H8.75V13h-1.5V8.75H3v-1.5h4.25z" />
            </svg>
            <span class="label">{s('addProject')}</span>
          </button>
        </nav>
        <footer>
          <span class={`live ${props.refreshing ? 'busy' : ''}`}>
            <span class="pulse" />
            {props.refreshing ? s('refreshing') : s('live')}
          </span>
          <button class="kbd-hint" onClick={() => setHelp(true)}>
            <kbd>?</kbd> {s('shortcuts')}
          </button>
        </footer>
      </aside>

      <main class="list-pane">
        <header class="pane-head" data-tauri-drag-region>
          <h1>{view.label}</h1>
          {view.count !== null && <span class="head-count">{view.count}</span>}
        </header>
        <div class="list" ref={listRef} role="listbox">
          {!rows.length && <div class="empty">{view.empty}</div>}
          {rows.map((r) => (
            <ListRow
              key={r.key}
              row={r}
              selected={current?.key === r.key}
              open={isOpen(r)}
              hidden={r.kind === 'node' && !isOpen(r) ? hiddenCount(view, view.rows.indexOf(r)) : 0}
              onClick={() => (isSelectable(r) ? select(r.key) : undefined)}
              onToggle={() => setFold(r, !isOpen(r))}
            />
          ))}
        </div>
      </main>

      <section class="detail-pane">
        <div class="drag" data-tauri-drag-region />
        {node ? (
          <Detail
            key={node.key}
            node={node}
            bench={bench}
            scrollRef={detailRef}
            composer={composer}
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            error={error}
            canAnswer={canAnswer(node)}
            onAnswer={startAnswer}
            onSend={send}
            onCancel={() => setComposer(null)}
            onReply={() => setComposer({ kind: 'reply' })}
            onFree={() => setComposer({ kind: 'free' })}
            onDefer={toggleDefer}
            onJump={jump}
            onImage={setLightbox}
            onQuestions={(picks) => act(() => api.answerQuestions(rootOf(node), node.id, picks), s('sent'))}
          />
        ) : current?.kind === 'fold' ? (
          <div class="placeholder">
            <div class="ph-glyph">✓</div>
            <p>{current.text}</p>
          </div>
        ) : (
          <div class="placeholder">
            <div class="ph-glyph">◇</div>
            <p class="ph-title">{s('nothingSelected')}</p>
            <p>{s('pickSomething')}</p>
          </div>
        )}
      </section>

      {palette && <Palette bench={bench} onPick={(k) => (setPalette(false), jump(k))} onClose={() => setPalette(false)} />}
      {help && <Help onClose={() => setHelp(false)} />}
      {lightbox !== null && node?.images[lightbox] && (
        <div class="lightbox" onClick={() => setLightbox(null)}>
          <img src={api.imageSrc(node.images[lightbox].path)} alt={node.images[lightbox].name} />
          <div class="lb-caption">
            {node.images[lightbox].caption ?? node.images[lightbox].name}
            {node.images.length > 1 && <span class="d"> · {lightbox + 1} / {node.images.length}</span>}
          </div>
        </div>
      )}
      <div class={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}

function ListRow(p: { row: Row; selected: boolean; open: boolean; hidden: number; onClick: () => void; onToggle: () => void }) {
  const r = p.row
  if (r.kind === 'header') return <div class="row header">{r.text}</div>
  const indent = { paddingInlineStart: `${12 + r.depth * 18}px` }
  if (r.kind === 'fold')
    return (
      <div class={`row fold ${p.selected ? 'sel' : ''}`} style={indent} onClick={() => (p.onClick(), p.onToggle())}>
        <span class={`caret ${p.open ? 'open' : ''}`}>›</span>
        <span class="fold-text">{r.text}</span>
      </div>
    )
  const badge = r.badge ?? []
  return (
    <div
      class={`row node ${p.selected ? 'sel' : ''} ${r.context ? 'context' : ''} ${r.deferred ? 'deferred' : ''} state-${r.state}`}
      style={indent}
      onClick={p.onClick}
      role="option"
      aria-selected={p.selected}
    >
      <span class={`mark ${r.mark ?? ''}`}>{r.mark ? '◆' : ''}</span>
      <span
        class={`caret ${r.has_kids ? '' : 'none'} ${p.open ? 'open' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (r.has_kids) p.onToggle()
        }}
      >
        {r.has_kids ? '›' : ''}
      </span>
      <Glyph g={r.glyph} />
      <span class="ref">{r.ref}</span>
      <span class="title">{r.title}</span>
      {p.hidden > 0 && <span class="hidden-count">+{p.hidden}</span>}
      <span class="badge">
        <Segs segs={badge} trim />
      </span>
    </div>
  )
}

function Detail(p: {
  node: Node
  bench: BenchData
  scrollRef: { current: HTMLDivElement | null }
  composer: Composer
  draft: string
  setDraft: (s: string) => void
  busy: boolean
  error: string | null
  canAnswer: boolean
  onAnswer: (key: string) => void
  onSend: () => void
  onCancel: () => void
  onReply: () => void
  onFree: () => void
  onDefer: () => void
  onJump: (key: string) => void
  onImage: (i: number) => void
  onQuestions: (picks: Record<string, string>) => void
}) {
  const n = p.node
  const files = n.attachments.filter((a) => !a.image)
  const chosen = n.answer?.choice
  const progressShown = n.meta.some((line) => line.some((s) => /^[█░]+$/.test(s.text)))
  return (
    <>
    <div class="detail" ref={p.scrollRef}>
      <div class="detail-inner">
        <div class="status-line">
          <span class="ref-pill">{n.ref}</span>
          <Segs segs={n.status_line} trim />
        </div>
        <h2 class="node-title">{n.title}</h2>
        <div class="meta">
          {n.meta
            .filter((line) => !line.every((s) => /^[\s┄]*$/.test(s.text)))
            .map((line, i) => (
              <div key={i} class="meta-line">
                <Segs segs={line} trim />
              </div>
            ))}
          {!progressShown && n.progress != null && n.progress > 0 && (
            <div class="meta-line">
              <Bar pct={n.progress} />
              <span> {n.progress}%</span>
            </div>
          )}
        </div>

        {n.options.length > 0 && !n.questions.length && (
          <section class="decide">
            <div class="section-title">{s('options')}</div>
            <div class="options">
              {n.options.map((o) => {
                const isDefault = n.default === o.key
                const isChosen = chosen === o.key
                const pending = p.composer?.kind === 'answer' && p.composer.key === o.key
                return (
                  <button
                    key={o.key}
                    class={`option ${isChosen ? 'chosen' : ''} ${pending ? 'pending' : ''} ${p.canAnswer ? '' : 'locked'}`}
                    onClick={() => p.onAnswer(o.key)}
                    disabled={!p.canAnswer}
                  >
                    <span class="key">{o.key}</span>
                    <span class="opt-main">
                      <span class="opt-label">
                        {o.label}
                        {isDefault && <span class="chip">{s('defaultOption')} ⏎</span>}
                        {isChosen && <span class="chip ok">✓ {s('answered')}</span>}
                      </span>
                      {o.body && (
                        <span class="opt-body">
                          <Body rows={o.body.split('\n').map((text) => ({ text }))} images={[]} onImage={() => {}} />
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {n.questions.length > 0 && <Questions node={n} busy={p.busy} onSubmit={p.onQuestions} />}

        {n.status === 'needs_decision' && !n.options.length && !n.questions.length && p.composer?.kind !== 'free' && (
          <section class="decide">
            <button class="option" onClick={p.onFree}>
              <span class="key">✎</span>
              <span class="opt-main">
                <span class="opt-label">{s('freeText')}</span>
              </span>
            </button>
          </section>
        )}

        <Body rows={n.body_rows} images={n.images} onImage={p.onImage} />

        {files.length > 0 && (
          <section class="files">
            <div class="section-title">{s('attachments')}</div>
            {files.map((a, i) => (
              <button key={i} class="file" onClick={() => api.openPath(a.path)}>
                <span class="file-ico">↗</span>
                <span>{a.label}</span>
                {a.caption && <span class="d"> — {a.caption}</span>}
              </button>
            ))}
          </section>
        )}
        <div class="spacer" />
      </div>
    </div>

      <div class="dock">
        {p.error && (
          <div class="error">
            <b>{s('errorTitle')}</b> {p.error}
          </div>
        )}
        {p.composer ? (
          <ComposerBox {...p} />
        ) : (
          <div class="actions">
            <button class="ghost" onClick={p.onReply}>
              {s('reply')} <kbd>N</kbd>
            </button>
            {!n.terminal && (
              <button class="ghost" onClick={p.onDefer}>
                {n.deferred_at ? s('undefer') : s('defer')} <kbd>D</kbd>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function ComposerBox(p: { node: Node; composer: Composer; draft: string; setDraft: (s: string) => void; busy: boolean; onSend: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [p.composer])
  const c = p.composer!
  const option = c.kind === 'answer' ? p.node.options.find((o) => o.key === c.key) : undefined
  const title = c.kind === 'answer' ? `${s('answerWith', { key: c.key })} · ${option?.label ?? ''}` : c.kind === 'reply' ? s('reply') : s('answer')
  const placeholder = c.kind === 'answer' ? s('addNote') : c.kind === 'reply' ? s('replyPlaceholder') : s('freeTextPlaceholder')
  const canSend = c.kind === 'answer' || p.draft.trim().length > 0
  return (
    <div class={`composer ${c.kind}`}>
      <div class="composer-title">{title}</div>
      <textarea
        ref={ref}
        rows={c.kind === 'answer' ? 2 : 3}
        value={p.draft}
        placeholder={placeholder}
        onInput={(e) => p.setDraft((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault()
            if (canSend) p.onSend()
          }
        }}
      />
      <div class="composer-actions">
        <span class="hint">⏎ {s('send')} · ⇧⏎ ↵ · Esc {s('cancel')}</span>
        <button class="ghost" onClick={p.onCancel}>
          {s('cancel')}
        </button>
        <button class="primary" disabled={!canSend || p.busy} onClick={p.onSend}>
          {s('send')}
        </button>
      </div>
    </div>
  )
}

function Questions({ node, busy, onSubmit }: { node: Node; busy: boolean; onSubmit: (picks: Record<string, string>) => void }) {
  const initial = Object.fromEntries(node.questions.map((q) => [q.key, node.answers?.[q.key] ?? q.default ?? q.options[0]?.key ?? '']))
  const [picks, setPicks] = useState<Record<string, string>>(initial)
  return (
    <section class="decide">
      <div class="section-title">{s('questions')}</div>
      {node.questions.map((q) => (
        <div key={q.key} class="question">
          <div class="q-label">
            <span class="key">{q.key}</span> {q.label}
          </div>
          <div class="chips">
            {q.options.map((o) => (
              <button key={o.key} class={`pick ${picks[q.key] === o.key ? 'on' : ''}`} onClick={() => setPicks({ ...picks, [q.key]: o.key })} title={o.body}>
                <span class="pk">{o.key}</span> {o.label}
                {q.default === o.key && <span class="d"> · {s('defaultOption')}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!node.terminal && (
        <div class="q-actions">
          <button class="primary" disabled={busy} onClick={() => onSubmit(picks)}>
            {s('submitAnswers')}
          </button>
        </div>
      )}
    </section>
  )
}

function Palette({ bench, onPick, onClose }: { bench: BenchData; onPick: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const all = useMemo(() => Object.values(bench.nodes).sort((a, b) => Number(a.terminal) - Number(b.terminal) || b.id - a.id), [bench])
  const term = q.trim().toLowerCase()
  const hits = (term
    ? all.filter((n) => n.ref.toLowerCase() === term || String(n.id) === term.replace(/^[a-z]/, '') || `${n.ref} ${n.title}`.toLowerCase().includes(term))
    : all
  ).slice(0, 50)
  const glyphOf = (n: Node) => n.status_line[0]
  return (
    <div class="overlay" onClick={onClose}>
      <div class="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          placeholder={s('gotoPlaceholder')}
          onInput={(e) => (setQ((e.target as HTMLInputElement).value), setAt(0))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setAt(Math.min(hits.length - 1, at + 1)))
            if (e.key === 'ArrowUp') (e.preventDefault(), setAt(Math.max(0, at - 1)))
            if (e.key === 'Enter' && hits[at]) onPick(hits[at].key)
            if (e.key === 'Escape') onClose()
          }}
        />
        <div class="hits">
          {!hits.length && <div class="empty small">{s('noMatch')}</div>}
          {hits.map((n, i) => (
            <div key={n.key} class={`hit ${i === at ? 'on' : ''}`} onMouseEnter={() => setAt(i)} onClick={() => onPick(n.key)}>
              <Glyph g={glyphOf(n)} />
              <span class="ref">{n.ref}</span>
              <span class="title">{n.title}</span>
              <span class="d small">{n.project}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Help({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [
    ['↑ ↓', s('keyMove')],
    ['← →', s('keyFold')],
    ['⇥ / ⌘1–5', s('keyViews')],
    ['1 – 9', s('keyAnswer')],
    ['⏎', s('keyDefault')],
    ['N', s('keyReply')],
    ['D', s('keyDefer')],
    ['G', s('keyGoto')],
    ['W', s('keyNext')],
    ['J K', s('keyScroll')],
    ['⌘O', s('keyAdd')],
    ['Esc', s('keyClose')],
  ]
  return (
    <div class="overlay" onClick={onClose}>
      <div class="help" onClick={(e) => e.stopPropagation()}>
        <h3>{s('helpTitle')}</h3>
        <dl>
          {keys.map(([k, v]) => (
            <>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </>
          ))}
        </dl>
      </div>
    </div>
  )
}

export type { View }
