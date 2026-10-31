/** The shape of `decs bench --json`. */

export interface Seg {
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
}

export type ViewName = 'available' | 'active' | 'decide' | 'all' | 'waiting'

export interface Row {
  key: string
  kind: 'node' | 'header' | 'fold'
  depth: number
  fold: string | null
  text?: string
  count?: number
  node?: string
  ref?: string
  title?: string
  state?: string
  glyph?: Seg
  mark?: 'strong' | 'weak' | null
  has_kids?: boolean
  collapsed?: boolean
  context?: boolean
  deferred?: boolean
  progress?: number | null
  badge?: Seg[]
  badge_short?: Seg[]
}

export interface View {
  view: ViewName
  label: string
  empty: string
  count: number | null
  rows: Row[]
}

export interface Option {
  key: string
  label: string
  body: string
}

export interface Question {
  key: string
  label: string
  default: string | null
  options: Option[]
}

export interface BodyRow {
  text: string
  image?: number
  style?: Seg
}

export interface Image {
  name: string
  alt: string
  target: string
  path: string
  source: 'body' | 'attachment'
  attachment: number | null
  group: string | null
  caption: string | null
}

export interface Attachment {
  label: string
  target: string
  path: string
  image: boolean
  group: string | null
  caption: string | null
}

export interface Node {
  key: string
  id: number
  ref: string
  project: string
  title: string
  author: string
  who: string
  status: string
  status_label: string
  kind: string
  default: string | null
  options: Option[]
  questions: Question[]
  answer: { choice?: string; note?: string; by: string; at: string } | null
  answers: Record<string, string> | null
  deferred_at: string | null
  parent: number | null
  children: number[]
  can_default: boolean
  can_pin: boolean
  pin: 'top' | 'bottom' | null
  urgency: 'high' | 'normal' | 'low'
  status_line: Seg[]
  meta: Seg[][]
  body_rows: BodyRow[]
  images: Image[]
  attachments: Attachment[]
  terminal: boolean
  backlinks: string[]
  progress: number | null
  archived: boolean
}

export interface Project {
  project: string
  letter: string
  root: string
}

export interface Bench {
  now: string
  lang: string
  rtl: boolean
  labels: { defaultMark: string }
  projects: Project[]
  views: View[]
  nodes: Record<string, Node>
}

export interface ShellEnv {
  path: string
  node: string | null
  node_version: string | null
  npm: string | null
  decs: string | null
  decs_version: string | null
}

export interface RunOutput {
  code: number
  stdout: string
  stderr: string
}
