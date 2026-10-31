// Runs inside the real window (debug build, DECS_APP_SCRIPT): first-run onboarding, then
// answering, replying, deferring and jumping on the bench. Every step logs to the app's
// stderr; `SHOT <name>` lines are where the runner takes a screenshot.
;(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke
  const log = (line) => invoke('log', { line })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const $ = (sel) => document.querySelector(sel)
  const $$ = (sel) => [...document.querySelectorAll(sel)]
  async function until(what, fn, ms = 15000) {
    const end = Date.now() + ms
    for (;;) {
      const v = fn()
      if (v) return v
      if (Date.now() > end) throw new Error(`timed out: ${what}`)
      await sleep(100)
    }
  }
  const shot = async (name) => {
    await invoke('e2e_shot', { name })
    await sleep(1400)
  }
  const key = (k, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const type = (el, text) => {
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const button = (text) => $$('button').find((b) => b.textContent.trim().startsWith(text))
  const toast = (text) => until(`toast "${text}"`, () => $('.toast.show')?.textContent.includes(text))

  try {
    log('STEP welcome')
    ;(await until('Get started', () => button('Get started'))).click()
    await sleep(400)
    await shot('add-project')
    const drop = await until('folder step', () => $('.drop') || $('.agents'))
    if (drop.classList.contains('drop')) drop.click()

    log('STEP agents')
    await until('agents step', () => $('.agents'))
    await sleep(300)
    // Only Codex: connecting Claude Code would install the plugin into this machine's real setup.
    for (const pick of $$('.agent-pick')) {
      const want = pick.textContent.includes('Codex')
      if (pick.classList.contains('on') !== want) pick.querySelector('input').click()
      await sleep(50)
    }
    await shot('agents')
    ;(await until('Connect', () => button('Connect'))).click()
    await until('setup finished', () => $('.logo.done') || $('.act'))
    await sleep(300)
    await shot('agents-result')
    if (!$('.logo.done')) (await until('Continue', () => button('Continue'))).click()

    log('STEP done')
    ;(await until('Open the bench', () => button('Open the bench'))).click()
    await until('bench', () => $('.shell .row.node'))
    await sleep(600)
    await shot('bench')

    log('STEP answer')
    $$('.nav-item').find((b) => b.textContent.includes('Decide')).click()
    await sleep(200)
    $$('.row.node').find((r) => r.textContent.includes('Pick a database')).click()
    await sleep(200)
    key('2')
    const answerBox = await until('answer composer', () => $('.composer textarea'))
    type(answerBox, 'Postgres — we need the JSON columns')
    await sleep(200)
    await shot('answer-composer')
    answerBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await toast('Sent')
    await sleep(800)
    await shot('answered')

    log('STEP enter-default')
    $$('.nav-item').find((b) => b.textContent.includes('Decide')).click()
    await sleep(200)
    $$('.row.node').find((r) => r.textContent.includes('Announce the launch')).click()
    await sleep(200)
    key('Enter')
    const confirm = await until('default composer', () => $('.composer textarea'))
    confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await toast('Sent')

    log('STEP reply')
    $$('.nav-item').find((b) => b.textContent.includes('All')).click()
    await sleep(200)
    $$('.row.node').find((r) => r.textContent.includes('Write the schema')).click()
    await sleep(200)
    key('N')
    const replyBox = await until('reply composer', () => $('.composer textarea'))
    type(replyBox, '先把 users 表的索引补上，再跑迁移。')
    replyBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await toast('Reply added')
    await sleep(800)
    await shot('replied')

    log('STEP defer')
    $$('.row.node').find((r) => r.textContent.includes('Tidy the logs')).click()
    await sleep(200)
    key('d')
    await toast('Deferred')

    log('STEP pin')
    const pick = async (title) => {
      $$('.row.node').find((r) => r.textContent.includes(title)).click()
      await sleep(200)
    }
    await pick('Rename the bucket')
    key('t')
    await toast('Pinned')
    await sleep(600)

    log('STEP close')
    await pick('Rotate the keys')
    key('x')
    const why = await until('close composer', () => $('.composer textarea'))
    type(why, 'merged into X5')
    why.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await toast('Closed')
    await sleep(600)

    log('STEP seen')
    await pick('Weekly report is ready')
    key('a')
    await toast('Marked as seen')
    await sleep(600)

    log('STEP goto')
    key('g')
    const box = await until('palette', () => $('.palette input'))
    type(box, 'X1')
    await sleep(200)
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await until('X1 selected', () => $('.row.sel')?.textContent.includes('X1'))

    log('STEP help')
    await sleep(300)
    key('?')
    await until('help', () => $('.help'))
    await shot('help')
    key('Escape')

    log('DONE')
  } catch (e) {
    log(`PAGE ${document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)}`)
    log(`FAIL ${e.message}`)
    await shot('failure')
  }
})()
