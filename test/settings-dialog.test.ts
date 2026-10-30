import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// core/settings.ts (via core/config.ts) freezes its on-disk path to
// DECS_HOME the moment it's first imported — so DECS_HOME has to be set
// before that happens, and nothing here can use a plain top-level `import`
// for anything that reaches it (which, transitively, is almost everything:
// src/tui/app.ts pulls in i18n, which pulls in core/config.ts).
const SETTINGS_HOME = mkdtempSync(join(tmpdir(), 'decs-settings-dialog-'))
process.env.DECS_HOME = SETTINGS_HOME

const { initLayout } = await import('../src/core/paths.ts')
const { Store } = await import('../src/core/store.ts')
const { buildOverview } = await import('../src/core/overview.ts')
const { buildFrame, geometry, hitTest } = await import('../src/tui/app.ts')
// Aliased: `t` is also the node:test callback's own test-context parameter.
const { setLang, isRtl, t: translate, LANGUAGES } = await import('../src/i18n/index.ts')
const { visualText } = await import('../src/i18n/bidi.ts')
const { nearestSelectable, rowsFor } = await import('../src/tui/views.ts')
const { stringWidth } = await import('../src/tui/width.ts')
const { RESET } = await import('../src/tui/zoom.ts')
const { SETTINGS, setSetting } = await import('../src/core/settings.ts')
const { bench, has, KEY } = await import('./tui-harness.ts')

type Lang = (typeof LANGUAGES)[number]
type Store = InstanceType<typeof Store>
type FrameInput = Parameters<typeof geometry>[0]

const text = (segs: { text: string }[]) => segs.map((s) => s.text).join('')
const frameText = (frame: { text: string }[][]) => frame.map(text).join('\n')
const A = 'lead · settings test'
const OPTS = [{ key: '1', label: 'Ship it' }, { key: '2', label: 'Hold' }]

function tmpStore(t: { after: (fn: () => void) => void }): Store {
  const root = mkdtempSync(join(tmpdir(), 'decs-settings-store-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return new Store([initLayout(root)])
}

function input(store: Store, over: Partial<FrameInput> = {}): FrameInput {
  const view = over.view ?? 'all'
  const items = over.items ?? store.all()
  const now = over.now ?? Date.now()
  const list = over.list ?? rowsFor(view, items)
  const index = over.index ?? nearestSelectable(list, 0, 1)
  return {
    view,
    list,
    index,
    current: index >= 0 ? list[index]?.node : undefined,
    items,
    overview: buildOverview(items, now),
    now,
    rows: 30,
    width: 100,
    offset: 0,
    condensed: false,
    mode: 'settings',
    draft: '',
    caret: 0,
    imageSel: 0,
    pendingKey: null,
    banner: null,
    zoom: RESET,
    zoomable: false,
    detailFocus: false,
    imageSize: null,
    settingIndex: 0,
    ...over,
  } as FrameInput
}

function inLang<T>(lng: Lang, f: () => T): T {
  setLang(lng)
  try {
    return f()
  } finally {
    setLang('en')
  }
}

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(SETTINGS_HOME, 'config.json'), 'utf8'))
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Frame rendering, all five languages
// ---------------------------------------------------------------------------

for (const lng of LANGUAGES) {
  test(`${lng}: the settings dialog renders at 100 cols — every label present, no overflow, no leaked keys`, (t) => {
    const store = tmpStore(t)
    store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
    inLang(lng, () => {
      const s = input(store, { width: 100 })
      const frame = buildFrame(s, geometry(s))
      for (const line of frame) assert.ok(stringWidth(text(line)) <= 100, `${lng}: overflow — ${JSON.stringify(text(line))}`)
      const whole = frameText(frame)
      for (const setting of SETTINGS) {
        const label = translate(`settings.label.${setting.key}`)
        const want = isRtl() ? visualText(label) : label
        assert.ok(whole.includes(want), `${lng}: missing the ${setting.key} label`)
      }
      assert.doesNotMatch(whole, /\{\{/, `${lng}: an untranslated placeholder leaked`)
      assert.doesNotMatch(whole, /\bsettings\.[a-zA-Z][\w.]*\b/, `${lng}: a raw settings.* key leaked`)
    })
  })
}

// ---------------------------------------------------------------------------
// Keyboard + persistence, via the real component
// ---------------------------------------------------------------------------

test('↓ then → moves the selection and persists the new value to $DECS_HOME/config.json', async (t) => {
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  t.after(() => setSetting('bidi', undefined))
  const b = bench(t, store, { view: 'all' })
  await b.until(has(b, /Ship release 2\.4/))
  await b.press(',')
  await b.until(has(b, /│ +Settings +│/))
  await b.press(KEY.down) // lang -> bidi
  await b.press(KEY.right) // visual -> terminal (the only other value)
  await b.until(() => readConfig().bidi === 'terminal')
  assert.equal(readConfig().bidi, 'terminal')
  await b.press('\x1b')
})

test('changing language in the dialog re-renders the bench immediately, with no restart', async (t) => {
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  const prevLang = process.env.DECS_LANG
  // Let `lang` be config-sourced for this test — DECS_LANG (set by the
  // suite) would otherwise lock it, same as the env test below checks.
  delete process.env.DECS_LANG
  t.after(() => {
    if (prevLang !== undefined) process.env.DECS_LANG = prevLang
    else delete process.env.DECS_LANG
    setSetting('lang', undefined)
  })
  const b = bench(t, store, { view: 'all' })
  await b.until(has(b, /Available/))
  await b.press(',')
  await b.until(has(b, /│ +Settings +│/))
  await b.press(KEY.right) // lang: auto -> en
  await b.until(has(b, /Available/)) // the tab names switch while the dialog is still open
  assert.match(b.frame()[0], /Available/)
  assert.equal(readConfig().lang, 'en')
  await b.press('\x1b')
})

test('toggling mouse in the dialog writes the on/off escape sequence to the terminal right away', async (t) => {
  const { MOUSE_OFF, MOUSE_ON } = await import('../src/tui/mouse.ts')
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  t.after(() => setSetting('mouse', undefined))
  const b = bench(t, store, { view: 'all' })
  await b.until(has(b, /Ship release 2\.4/))
  await b.press(',')
  await b.until(has(b, /│ +Settings +│/))
  const mouseIndex = SETTINGS.findIndex((s) => s.key === 'mouse')
  for (let i = 0; i < mouseIndex; i++) await b.press(KEY.down) // walk down to "mouse"
  const before = b.out.chunks.length
  await b.press(KEY.right) // on -> off
  await b.until(() => readConfig().mouse === 'off')
  assert.ok(b.out.chunks.slice(before).some((c) => c.includes(MOUSE_OFF)), 'MOUSE_OFF was not written live')
  await b.press(KEY.right) // off -> on
  await b.until(() => readConfig().mouse === undefined)
  assert.ok(b.out.chunks.slice(before).some((c) => c.includes(MOUSE_ON)), 'MOUSE_ON was not written live')
  await b.press('\x1b')
})

test('Esc closes the dialog — the frame matches what it was before opening', async (t) => {
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  const b = bench(t, store, { view: 'all' })
  await b.until(has(b, /Ship release 2\.4/))
  const before = b.frame().join('\n')
  await b.press(',')
  await b.until(has(b, /│ +Settings +│/))
  await b.press('\x1b')
  await b.until(() => !has(b, /│ +Settings +│/)())
  assert.equal(b.frame().join('\n'), before)
})

test('`,` again also closes the dialog', async (t) => {
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  const b = bench(t, store, { view: 'all' })
  await b.until(has(b, /Ship release 2\.4/))
  await b.press(',')
  await b.until(has(b, /│ +Settings +│/))
  await b.press(',')
  await b.until(() => !has(b, /│ +Settings +│/)())
})

test('an env-overridden setting (lang, via DECS_LANG) is greyed with "set by …", and → does not change it', async (t) => {
  assert.equal(process.env.DECS_LANG, 'en', 'sanity: the suite pins DECS_LANG, which is what locks this setting')
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  const b = bench(t, store, { view: 'all' })
  await b.until(has(b, /Available/))
  await b.press(',')
  await b.until(has(b, /set by DECS_LANG/))
  const before = b.frame().join('\n')
  await b.press(KEY.right)
  await b.quiet()
  assert.equal(b.frame().join('\n'), before, 'an env-sourced setting does not change')
  assert.equal(readConfig().lang, undefined, 'and nothing was written for it')
  await b.press('\x1b')
})

// ---------------------------------------------------------------------------
// Right-to-left: mirrored layout, exact hit-testing
// ---------------------------------------------------------------------------

test('ar: the dialog is mirrored (value on the left, label on the right) and a click on the value hits exactly', (t) => {
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  inLang('ar', () => {
    const s = input(store, { width: 100, settingIndex: 1 }) // bidi: cyclable, not env-sourced by default
    const g = geometry(s)
    const frame = buildFrame(s, g)
    const row = g.settingsModal.rows.find((r) => r.index === 1)
    assert.ok(row?.valueFrom !== undefined, 'bidi should be cyclable here')
    const { row: y, valueFrom, valueTo } = row!

    // The value sits in the left half of the box, the label in the right half.
    const mid = g.settingsModal.left + g.settingsModal.width / 2
    assert.ok(valueTo! <= mid, `value should be on the left half: ${JSON.stringify({ valueFrom, valueTo, mid })}`)

    // Every column in the value's own span hits it exactly; one before or after does not.
    assert.deepEqual(hitTest(s, g, valueFrom! + 1, y + 1), { on: 'settingValue', index: 1 })
    assert.deepEqual(hitTest(s, g, valueTo!, y + 1), { on: 'settingValue', index: 1 })
    assert.notDeepEqual(hitTest(s, g, valueFrom!, y + 1), { on: 'settingValue', index: 1 })
    assert.notDeepEqual(hitTest(s, g, valueTo! + 1, y + 1), { on: 'settingValue', index: 1 })

    // No row wider than the frame, mirrored or not.
    for (const line of frame) assert.ok(stringWidth(text(line)) <= 100)
  })
})

test('a click outside the dialog box closes it; a click on a row (not its value) just selects it', (t) => {
  const store = tmpStore(t)
  store.create({ title: 'Ship release 2.4', author: A, options: OPTS, default: '1' })
  const s = input(store, { width: 100, settingIndex: 0 })
  const g = geometry(s)
  assert.deepEqual(hitTest(s, g, 1, 1), { on: 'settingsBackdrop' })
  const row = g.settingsModal.rows.find((r) => r.index === 2)! // "view" — selecting it doesn't cycle it
  const labelX = g.settingsModal.left + 3
  assert.deepEqual(hitTest(s, g, labelX, row.row + 1), { on: 'setting', index: 2 })
})
