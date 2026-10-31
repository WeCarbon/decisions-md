import type { Bench, Node, Project, RunOutput, ShellEnv } from './types.ts'

/**
 * Everything the window knows comes from the `decs` CLI: reads are
 * `decs … --json`, writes are plain `decs` commands, live updates are
 * `decs monitor --updates`. Outside the desktop shell (a plain browser,
 * for screenshots) it plays back a recorded `decs bench --json`.
 */
export const inDesktop = '__TAURI_INTERNALS__' in window

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
let invokeFn: Invoke | null = null
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!invokeFn) invokeFn = (await import('@tauri-apps/api/core')).invoke as Invoke
  return invokeFn<T>(cmd, args)
}

export class DecsError extends Error {}

async function run(args: string[], cwd?: string): Promise<RunOutput> {
  if (!inDesktop) return demoRun(args)
  return invoke<RunOutput>('decs', { args, cwd: cwd ?? null })
}

async function ok(args: string[], cwd?: string): Promise<string> {
  const out = await run(args, cwd)
  if (out.code !== 0) throw new DecsError((out.stderr || out.stdout).replace(/^decs [a-z]+: /, '').trim())
  return out.stdout
}

export async function shellEnv(refresh = false): Promise<ShellEnv> {
  if (!inDesktop) return { path: '', node: '/usr/local/bin/node', node_version: 'v22.18.0', npm: '/usr/local/bin/npm', decs: '/usr/local/bin/decs', decs_version: '0.1.0' }
  return invoke<ShellEnv>('shell_env', { refresh })
}

export async function installDecs(): Promise<RunOutput> {
  return invoke<RunOutput>('install_decs')
}

export const loadBench = async (): Promise<Bench> => JSON.parse(await ok(['bench', '--json']))

export const loadNode = async (root: string, id: number): Promise<Node> => JSON.parse(await ok(['bench', '--json', '--node', String(id), '--dir', root]))

export const listProjects = async (): Promise<Project[]> =>
  (JSON.parse(await ok(['projects', '--json'])) as { name: string; root: string }[]).map((p) => ({ project: p.name, root: p.root, letter: '' }))

const human = ['--human']

export const answer = (root: string, id: number, choice: string, note?: string) =>
  ok(['push', String(id), choice, ...(note ? ['--note', note] : []), ...human, '--dir', root])

export const answerQuestions = (root: string, id: number, picks: Record<string, string>, note?: string) =>
  ok(['push', String(id), ...Object.entries(picks).map(([q, k]) => `${q}=${k}`), ...(note ? ['--note', note] : []), ...human, '--dir', root])

export const answerDefaults = (root: string, id: number) => ok(['push', String(id), '--defaults', ...human, '--dir', root])

export const answerFreeText = (root: string, id: number, note: string) => ok(['push', String(id), '--note', note, ...human, '--dir', root])

export const reply = (root: string, id: number, text: string) => ok(['note', String(id), text, ...human, '--dir', root])

export const defer = (root: string, id: number, off: boolean) => ok(['defer', String(id), ...(off ? ['--off'] : []), ...human, '--dir', root])

export const pin = (root: string, id: number, where: 'top' | 'bottom' | 'off') => ok(['pin', String(id), where, '--dir', root])

export const close = (root: string, id: number, reason: string) => ok(['close', String(id), '--reason', reason, '--dir', root])

export const seen = (root: string, id: number) => ok(['archive', String(id), '--seen', '--dir', root])

export const initProject = (dir: string) => ok(['init', dir])

export const addProject = (dir: string) => ok(['projects', 'add', dir])

export type Agent = 'claude' | 'codex' | 'kimi'

export interface AgentSetup {
  detected: boolean
  action: 'skipped' | 'created' | 'updated' | 'unchanged' | 'manual' | 'error'
  detail: string
  file?: string
}

export interface SetupResult {
  dir: string
  dryRun: boolean
  agents: Partial<Record<Agent, AgentSetup>>
}

/** `decs setup`: teaches the project's agents to ask through decs. `dryRun` only reports what is detected. */
export async function setupAgents(dir: string, agents: Agent[], dryRun = false): Promise<SetupResult> {
  if (!inDesktop) return demoSetup(agents, dryRun)
  const out = await run(['setup', '--json', '--for', agents.join(','), '--dir', dir, ...(dryRun ? ['--dry-run'] : [])])
  try {
    return JSON.parse(out.stdout) as SetupResult
  } catch {
    throw new DecsError((out.stderr || out.stdout).replace(/^decs [a-z]+: /, '').trim())
  }
}

function demoSetup(agents: Agent[], dryRun: boolean): SetupResult {
  const result: SetupResult['agents'] = {}
  for (const a of agents)
    result[a] = a === 'kimi' ? { detected: false, action: 'skipped', detail: 'kimi not found on PATH' } : { detected: true, action: dryRun ? 'unchanged' : 'created', detail: '' }
  return { dir: '/Users/alice/Code/api', dryRun, agents: result }
}

export async function startMonitor(onChange: () => void): Promise<void> {
  if (!inDesktop) return
  const { listen } = await import('@tauri-apps/api/event')
  await listen<string>('decs-event', () => onChange())
  await invoke('monitor_start').catch(() => {})
}

export async function snapshotLoad(): Promise<Bench | null> {
  if (!inDesktop) return null
  const text = await invoke<string | null>('snapshot_load')
  try {
    return text ? (JSON.parse(text) as Bench) : null
  } catch {
    return null
  }
}

export const snapshotSave = (bench: string) => (inDesktop ? invoke('snapshot_save', { json: bench }).catch(() => {}) : Promise.resolve())

export async function prefsLoad<T>(fallback: T): Promise<T> {
  try {
    if (!inDesktop) return { ...fallback, ...JSON.parse(localStorage.getItem('decs-prefs') ?? '{}') }
    const text = await invoke<string | null>('prefs_load')
    return text ? { ...fallback, ...JSON.parse(text) } : fallback
  } catch {
    return fallback
  }
}

export function prefsSave(prefs: unknown): void {
  const text = JSON.stringify(prefs)
  if (!inDesktop) {
    try {
      localStorage.setItem('decs-prefs', text)
    } catch {
      /* private mode */
    }
    return
  }
  invoke('prefs_save', { json: text }).catch(() => {})
}

/** Shows the window on the first call; each call logs how long after launch `what` happened (DECS_APP_TIMING=1). */
export async function ready(what: string): Promise<number> {
  if (!inDesktop) return performance.now()
  return invoke<number>('ready', { what })
}

export function log(line: string): void {
  if (inDesktop) invoke('log', { line }).catch(() => {})
  else console.error(line)
}

export async function pickFolder(): Promise<string | null> {
  if (!inDesktop) return '/Users/alice/Code/api'
  return invoke<string | null>('pick_folder')
}

export async function openPath(path: string): Promise<void> {
  if (!inDesktop) return
  const { openPath, openUrl } = await import('@tauri-apps/plugin-opener')
  await (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) ? openUrl(path) : openPath(path))
}

let convert: ((p: string) => string) | null = null
export async function prepareImages(): Promise<void> {
  if (inDesktop && !convert) convert = (await import('@tauri-apps/api/core')).convertFileSrc
}

export function imageSrc(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  if (!inDesktop) return `demo/${path.split('/').pop()}`
  return convert ? convert(path) : path
}

async function demoRun(args: string[]): Promise<RunOutput> {
  if (args[0] === 'bench' && !args.includes('--node')) {
    const res = await fetch('demo/bench.json')
    return { code: 0, stdout: await res.text(), stderr: '' }
  }
  if (args[0] === 'bench' && args.includes('--node')) return { code: 1, stdout: '', stderr: 'not in the demo' }
  if (args[0] === 'projects') return { code: 0, stdout: JSON.stringify(demoProjects()), stderr: '' }
  return { code: 0, stdout: '', stderr: '' }
}

function demoProjects() {
  const empty = new URLSearchParams(location.search).get('screen') === 'onboarding'
  return empty ? [] : [{ name: 'web', root: '/Users/alice/Code/web' }]
}
