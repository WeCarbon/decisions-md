import { useEffect, useState } from 'preact/hooks'
import * as api from './backend.ts'
import { s } from './strings.ts'

const isMac = /Mac/.test(navigator.platform)

/** `Ctrl+Alt+Space` → `⌃⌥Space` on a Mac; unchanged elsewhere. */
export function prettyHotkey(hotkey: string): string {
  if (!isMac) return hotkey
  const map: Record<string, string> = { Ctrl: '⌃', Control: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Cmd: '⌘', Command: '⌘', Super: '⌘', CmdOrCtrl: '⌘' }
  return hotkey
    .split('+')
    .map((p) => map[p] ?? p)
    .join('')
}

/** The keys pressed, in the global-shortcut plugin's own spelling: `Ctrl+Alt+Space`. */
function hotkeyFrom(e: KeyboardEvent): string | null {
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[]
  const code = e.code
  let key: string | null = null
  if (code === 'Space') key = 'Space'
  else if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5)
  else if (/^F[0-9]{1,2}$/.test(code)) key = code
  else if (['Enter', 'Tab', 'Backquote', 'Period', 'Comma', 'Slash', 'Semicolon', 'Quote', 'BracketLeft', 'BracketRight', 'Minus', 'Equal'].includes(code)) key = code
  if (!key || !mods.length) return null
  return [...mods, key].join('+')
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<api.SettingsView | null>(null)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.settingsGet().then(setView)
  }, [])

  const save = async (next: api.AppSettings) => {
    if (!view) return
    setError(null)
    try {
      await api.settingsSet(next)
      setView({ ...view, settings: next, hotkeyError: null })
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    } catch {
      setError(s('hotkeyTaken'))
    }
  }

  useEffect(() => {
    if (!recording || !view) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(false)
      const hk = hotkeyFrom(e)
      if (!hk) return
      setRecording(false)
      void save({ ...view.settings, hotkey: hk })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, view])

  if (!view) return null
  const st = view.settings
  const styles: { id: api.NotifyStyle; label: string; hint: string }[] = [
    { id: 'system', label: s('notifySystem'), hint: s('notifySystemHint') },
    { id: 'banner', label: s('notifyBanner'), hint: s('notifyBannerHint') },
    { id: 'off', label: s('notifyOff'), hint: s('notifyOffHint') },
  ]
  return (
    <div class="overlay" onClick={onClose}>
      <div class="settings" onClick={(e) => e.stopPropagation()}>
        <h3>
          {s('settingsTitle')}
          {saved && <span class="saved">✓</span>}
        </h3>

        <section>
          <div class="s-label">{s('notifications')}</div>
          <div class="s-choices">
            {styles.map((o) => (
              <button key={o.id} class={`s-choice ${st.notify === o.id ? 'on' : ''}`} onClick={() => void save({ ...st, notify: o.id })}>
                <span class="s-radio" />
                <span>
                  <span class="s-choice-label">{o.label}</span>
                  <span class="s-hint">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div class="s-label">{s('hotkey')}</div>
          <div class="s-row">
            <button class={`s-hotkey ${recording ? 'recording' : ''}`} onClick={() => setRecording(!recording)}>
              {recording ? s('hotkeyRecord') : st.hotkey ? prettyHotkey(st.hotkey) : s('hotkeyNone')}
            </button>
            {st.hotkey && (
              <button class="quiet" onClick={() => void save({ ...st, hotkey: '' })}>
                {s('hotkeyClear')}
              </button>
            )}
            {st.hotkey !== view.defaultHotkey && (
              <button class="quiet" onClick={() => void save({ ...st, hotkey: view.defaultHotkey })}>
                {s('hotkeyDefault', { key: prettyHotkey(view.defaultHotkey) })}
              </button>
            )}
          </div>
          <p class="s-hint">{s('hotkeyHint')}</p>
          {view.ctrlSpaceTaken && <p class="s-note">{s('ctrlSpaceNote')}</p>}
          {(error || view.hotkeyError) && <p class="s-error">{error ?? s('hotkeyTaken')}</p>}
        </section>

        <section>
          <label class="s-toggle">
            <input type="checkbox" checked={st.keepInTray} onChange={() => void save({ ...st, keepInTray: !st.keepInTray })} />
            <span class="s-switch" />
            <span>
              <span class="s-choice-label">{s('keepInTray')}</span>
              <span class="s-hint">{s('keepInTrayHint')}</span>
            </span>
          </label>
        </section>
      </div>
    </div>
  )
}
