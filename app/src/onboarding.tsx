import { useEffect, useState } from 'preact/hooks'
import { Bot, FileText, FolderOpen, Keyboard } from 'lucide-preact'
import * as api from './backend.ts'
import { s } from './strings.ts'
import type { ShellEnv } from './types.ts'

type Step = 'welcome' | 'check' | 'add' | 'agents' | 'done'

const NPM_INSTALL = 'npm install -g @wecarbon/noddit'
const NODE_INSTALL = 'brew install node'
const AGENTS: { id: api.Agent; name: string }[] = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' },
  { id: 'kimi', name: 'Kimi' },
]

export const envReady = (env: ShellEnv | null) => Boolean(env?.node && env.decs)

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div class="copyable">
      <code>{text}</code>
      <button
        class="ghost small"
        onClick={() => {
          void navigator.clipboard?.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? s('copied') : s('copy')}
      </button>
    </div>
  )
}

/**
 * First launch, or no nod on this machine yet: welcome → check Node/nod →
 * pick a folder (`nod init`) → agent integrations → the bench.
 * `startAt: 'add'` is the same flow for adding another project later.
 */
export function Onboarding(props: { env: ShellEnv | null; startAt?: Step; onEnv: (e: ShellEnv) => void; onDone: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState<Step>(props.startAt ?? 'welcome')
  const [env, setEnv] = useState<ShellEnv | null>(props.env)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [agents, setAgents] = useState<api.Agent[]>([])
  const [found, setFound] = useState<api.SetupResult['agents'] | null>(null)
  const [setup, setSetup] = useState<api.SetupResult['agents'] | null>(null)
  const [agentNote, setAgentNote] = useState<string | null>(null)

  const recheck = async () => {
    setBusy(true)
    const next = await api.shellEnv(true)
    setEnv(next)
    props.onEnv(next)
    setBusy(false)
  }
  useEffect(() => {
    if (step === 'check' && !env) void recheck()
  }, [step])

  const install = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await api.installDecs()
      if (out.code !== 0) setError(out.stderr.trim().split('\n').slice(-3).join('\n'))
    } catch (e) {
      setError(String(e))
    }
    await recheck()
  }

  const choose = async () => {
    if (busy) return
    setError(null)
    const dir = await api.pickFolder()
    if (!dir) return
    setBusy(true)
    try {
      await api.initProject(dir)
      // init leaves temp and scratch folders unregistered; a folder picked here is meant to stay.
      await api.addProject(dir)
      setFolder(dir)
      const all = AGENTS.map((a) => a.id)
      const probe = await api.setupAgents(dir, all, true).catch(() => null)
      setFound(probe?.agents ?? null)
      setAgents(probe ? all.filter((a) => probe.agents[a]?.detected) : ['claude'])
      if (!probe) setAgentNote(s('agentsPending'))
      setStep('agents')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    if (!folder) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.setupAgents(folder, agents)
      setSetup(r.agents)
      const needsReading = Object.values(r.agents).some((a) => a?.action === 'manual' || a?.action === 'error')
      if (!needsReading) setStep('done')
    } catch (e) {
      setAgentNote(s('agentsPending'))
      setStep('done')
    } finally {
      setBusy(false)
    }
  }

  const name = folder?.split('/').filter(Boolean).pop() ?? ''
  const dots: Step[] = ['welcome', 'check', 'add', 'agents', 'done']

  return (
    <div class="onboarding">
      <div class="drag" data-tauri-drag-region />
      {props.onCancel && (
        <button class="ghost close" onClick={props.onCancel}>
          {s('cancel')}
        </button>
      )}
      <div class="card">
        {step === 'welcome' && (
          <>
            <div class="logo">
              <span />
            </div>
            <h1>{s('welcomeTitle')}</h1>
            <ul class="how">
              <li>
                <span class="how-ico">
                  <Bot size={17} strokeWidth={1.75} />
                </span>
                {s('stepAsk')}
              </li>
              <li>
                <span class="how-ico">
                  <Keyboard size={17} strokeWidth={1.75} />
                </span>
                {s('stepAnswer')}
              </li>
              <li>
                <span class="how-ico">
                  <FileText size={17} strokeWidth={1.75} />
                </span>
                {s('stepKeep')}
              </li>
            </ul>
            <button class="primary big" autoFocus onClick={() => setStep(envReady(env) ? 'add' : 'check')}>
              {s('getStarted')}
            </button>
          </>
        )}

        {step === 'check' && (
          <>
            <h1>{s('checkTitle')}</h1>
            <ul class="checks">
              <li class={env?.node ? 'ok' : 'missing'}>
                <span class="tick">{env?.node ? '✓' : '·'}</span>
                <div>
                  <div>{env?.node ? s('nodeOk', { version: env.node_version ?? '' }) : s('nodeMissing')}</div>
                  {env && !env.node && (
                    <>
                      <p class="hint">{s('nodeHint')}</p>
                      <Copyable text={NODE_INSTALL} />
                    </>
                  )}
                </div>
              </li>
              <li class={env?.decs ? 'ok' : 'missing'}>
                <span class="tick">{env?.decs ? '✓' : '·'}</span>
                <div>
                  <div>{env?.decs ? s('decsOk', { version: env.decs_version ?? '' }) : s('decsMissing')}</div>
                  {env && !env.decs && (
                    <>
                      <p class="hint">{s('decsHint')}</p>
                      <Copyable text={NPM_INSTALL} />
                      {env.npm && (
                        <button class="primary" disabled={busy} onClick={install}>
                          {busy ? s('installing') : s('installForMe')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            </ul>
            {error && <pre class="error">{error}</pre>}
            <div class="row-actions">
              <button class="ghost" disabled={busy} onClick={recheck}>
                {s('checkAgain')}
              </button>
              <button class="primary" disabled={!envReady(env)} onClick={() => setStep('add')}>
                {s('continue')}
              </button>
            </div>
          </>
        )}

        {step === 'add' && (
          <>
            <h1>{s('addTitle')}</h1>
            <button class="drop" disabled={busy} onClick={choose} autoFocus>
              <FolderOpen size={30} strokeWidth={1.4} />
              <span>{busy ? s('settingUp') : s('chooseFolder')}</span>
              <span class="hint">{s('addBody')}</span>
            </button>
            {error && <pre class="error">{error}</pre>}
          </>
        )}

        {step === 'agents' && (
          <>
            <h1>{s('agentsTitle')}</h1>
            <p class="lede">{s('agentsBody')}</p>
            <div class="agents">
              {AGENTS.map((a) => {
                const on = agents.includes(a.id)
                const probe = found?.[a.id]
                const result = setup?.[a.id]
                return (
                  <div key={a.id} class="agent-wrap">
                    <label class={`agent-pick ${on ? 'on' : ''} ${probe && !probe.detected ? 'absent' : ''}`}>
                      <input type="checkbox" checked={on} disabled={Boolean(setup)} onChange={() => setAgents(on ? agents.filter((x) => x !== a.id) : [...agents, a.id])} />
                      <span class="box">{on ? '✓' : ''}</span>
                      <span class="agent-name">{a.name}</span>
                      <span class="agent-state">
                        {result ? <span class={`act act-${result.action}`}>{s(`act_${result.action}`)}</span> : probe && !probe.detected ? s('notFound') : probe ? s('detected') : ''}
                      </span>
                    </label>
                    {result && (result.action === 'manual' || result.action === 'error') && result.detail && (
                      <div class={`agent-detail ${result.action}`}>
                        {result.action === 'manual' && <p class="hint">{s('manualHint')}</p>}
                        {result.action === 'manual' ? result.detail.split('\n').filter(Boolean).map((l) => <Copyable key={l} text={l} />) : <pre class="error">{result.detail}</pre>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {agentNote && <p class="hint">{agentNote}</p>}
            {error && <pre class="error">{error}</pre>}
            <div class="row-actions">
              {setup ? (
                <button class="primary" onClick={() => setStep('done')}>
                  {s('continue')}
                </button>
              ) : (
                <>
                  <button class="ghost" onClick={() => setStep('done')}>
                    {s('skip')}
                  </button>
                  <button class="primary" disabled={busy || !agents.length || Boolean(agentNote)} onClick={connect}>
                    {busy ? s('settingUp') : s('connect')}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div class="logo done">
              <span>✓</span>
            </div>
            <h1>{s('allSet')}</h1>
            <p class="lede">{s('allSetBody', { project: name })}</p>
            <button class="primary big" autoFocus onClick={props.onDone}>
              {s('openBench')}
            </button>
          </>
        )}
      </div>
      <div class="steps">
        {dots.map((d) => (
          <span key={d} class={d === step ? 'on' : ''} />
        ))}
      </div>
    </div>
  )
}
