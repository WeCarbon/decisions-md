import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLang, type Lang } from '../src/i18n/index.ts'
import { durationText, elapsed, fromNow } from '../src/i18n/time.ts'

const NOW = Date.parse('2026-01-10T12:00:00Z')
const ago = (minutes: number) => NOW - minutes * 60_000

function inLang<T>(lng: Lang, f: () => T): T {
  setLang(lng)
  try {
    return f()
  } finally {
    setLang('en')
  }
}

test('the same timestamp reads as each language says it', () => {
  const threeDays = ago(3 * 24 * 60)
  assert.equal(inLang('en', () => fromNow(threeDays, NOW)), '3 days ago')
  assert.equal(inLang('zh-Hans', () => fromNow(threeDays, NOW)), '3 天前')
  assert.equal(inLang('zh-Hant', () => fromNow(ago(5), NOW)), '5 分鐘前')
  assert.equal(inLang('fr', () => fromNow(threeDays, NOW)), 'il y a 3 jours')
  assert.equal(inLang('ar', () => fromNow(threeDays, NOW)), 'قبل 3 أيام')
})

test('Arabic gets its singular, dual, plural and 11+ forms', () => {
  const days = (n: number) => inLang('ar', () => fromNow(ago(n * 24 * 60), NOW))
  assert.equal(days(1), 'قبل يوم واحد')
  assert.equal(days(2), 'قبل يومين')
  assert.equal(days(5), 'قبل 5 أيام')
  assert.equal(days(11), 'قبل 11 يومًا')
  assert.equal(inLang('ar', () => fromNow(ago(50), NOW)), 'قبل ساعة واحدة')
  assert.equal(inLang('ar', () => elapsed(ago(2 * 24 * 60), NOW)), 'يومان')
})

test('a span without "ago", and a bare duration', () => {
  assert.equal(inLang('en', () => elapsed(ago(2 * 24 * 60), NOW)), '2 days')
  assert.equal(inLang('fr', () => durationText(3 * 60 * 60_000)), '3 heures')
  assert.equal(inLang('zh-Hans', () => durationText(5 * 60_000)), '5 分钟')
})
