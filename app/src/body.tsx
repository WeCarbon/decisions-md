import type { ComponentChildren } from 'preact'
import { imageSrc } from './backend.ts'
import { segClass } from './segs.tsx'
import type { BodyRow, Image } from './types.ts'

/** `**bold**`, `` `code` ``, and links — the little markdown a node's prose leans on. */
export function Inline({ text }: { text: string }) {
  const out: ComponentChildren[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>)
    else if (m[2] !== undefined) out.push(<code key={i++}>{m[2]}</code>)
    else if (m[3] !== undefined) out.push(<a key={i++} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a>)
    else out.push(<a key={i++} href={m[5]} target="_blank" rel="noreferrer">{m[5]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

type Block =
  | { kind: 'heading'; row: BodyRow }
  | { kind: 'note'; row: BodyRow; human: boolean; rows: Block[] }
  | { kind: 'para'; lines: string[] }
  | { kind: 'list'; items: string[]; ordered: boolean }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'image'; index: number }
  | { kind: 'table'; rows: string[][] }

const isNoteHeading = (r: BodyRow) => Boolean(r.style && (r.style.color === 'magenta' || r.style.color === 'blue'))

function blocks(rows: BodyRow[]): Block[] {
  const out: Block[] = []
  let target = out
  let para: string[] | null = null
  let code: string[] | null = null
  const flush = () => {
    if (para?.length) target.push({ kind: 'para', lines: para })
    para = null
  }
  for (const r of rows) {
    if (code) {
      if (/^\s*```/.test(r.text)) {
        target.push({ kind: 'code', lines: code })
        code = null
      } else code.push(r.text)
      continue
    }
    if (/^\s*```/.test(r.text) && !r.style) {
      flush()
      code = []
      continue
    }
    if (r.image !== undefined) {
      flush()
      target.push({ kind: 'image', index: r.image })
      continue
    }
    if (r.style) {
      flush()
      if (isNoteHeading(r)) {
        const note: Block = { kind: 'note', row: r, human: r.style.color === 'magenta', rows: [] }
        out.push(note)
        target = note.rows
      } else target.push({ kind: 'heading', row: r })
      continue
    }
    const t = r.text
    if (!t.trim()) {
      flush()
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(t)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(t)
    if (bullet || numbered) {
      flush()
      const ordered = Boolean(numbered)
      const prev = target.at(-1)
      const item = (bullet ?? numbered)![1]
      if (prev?.kind === 'list' && prev.ordered === ordered) prev.items.push(item)
      else target.push({ kind: 'list', items: [item], ordered })
      continue
    }
    if (/^\s*>/.test(t)) {
      flush()
      const prev = target.at(-1)
      const line = t.replace(/^\s*>\s?/, '')
      if (prev?.kind === 'quote') prev.lines.push(line)
      else target.push({ kind: 'quote', lines: [line] })
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(t)) {
      flush()
      if (/^\s*\|[\s:|-]+\|\s*$/.test(t)) continue
      const cells = t.trim().slice(1, -1).split('|').map((c) => c.trim())
      const prev = target.at(-1)
      if (prev?.kind === 'table') prev.rows.push(cells)
      else target.push({ kind: 'table', rows: [cells] })
      continue
    }
    ;(para ??= []).push(t)
  }
  flush()
  if (code) target.push({ kind: 'code', lines: code })
  return out
}

function Blocks({ list, images, onImage }: { list: Block[]; images: Image[]; onImage: (i: number) => void }) {
  return (
    <>
      {list.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <h3 key={i} class={segClass({ ...b.row.style, color: undefined })}>{b.row.text}</h3>
          case 'note':
            return (
              <section key={i} class={`note ${b.human ? 'human' : 'agent'}`}>
                <header>
                  <span class="dot" />
                  {b.row.text}
                </header>
                <Blocks list={b.rows} images={images} onImage={onImage} />
              </section>
            )
          case 'para':
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <>
                    {j > 0 && <br />}
                    <Inline text={l} />
                  </>
                ))}
              </p>
            )
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul'
            return (
              <L key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </L>
            )
          }
          case 'quote':
            return (
              <blockquote key={i}>
                {b.lines.map((l, j) => (
                  <div key={j}>
                    <Inline text={l} />
                  </div>
                ))}
              </blockquote>
            )
          case 'code':
            return <pre key={i}>{b.lines.join('\n')}</pre>
          case 'table':
            return (
              <div class="table-wrap" key={i}>
                <table>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (j === 0 ? <th key={k}><Inline text={c} /></th> : <td key={k}><Inline text={c} /></td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'image': {
            const im = images[b.index]
            if (!im) return null
            return (
              <figure key={i} class="shot" onClick={() => onImage(b.index)}>
                <img src={imageSrc(im.path)} alt={im.name} loading="lazy" decoding="async" />
                <figcaption>
                  {im.group && <span class="chip">{im.group}</span>}
                  {im.caption ?? im.name}
                </figcaption>
              </figure>
            )
          }
        }
      })}
    </>
  )
}

export function Body({ rows, images, onImage }: { rows: BodyRow[]; images: Image[]; onImage: (i: number) => void }) {
  return (
    <div class="prose">
      <Blocks list={blocks(rows)} images={images} onImage={onImage} />
    </div>
  )
}
