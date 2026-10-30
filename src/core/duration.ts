import { t } from '../i18n/index.ts'

/**
 * `90s`, `30m`, `1h`, `2d`, `1h30m` → milliseconds. A bare number is minutes,
 * because that is the unit people mean when they type `--stale 30`.
 */
export function parseDuration(raw: string): number {
  const s = raw.trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 60_000
  const unit: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  let total = 0
  let rest = s
  const re = /^(\d+(?:\.\d+)?)\s*([smhd])/
  while (rest) {
    const m = re.exec(rest)
    if (!m) throw new Error(t('core.duration.notADuration', { value: raw }))
    total += Number(m[1]) * unit[m[2]]
    rest = rest.slice(m[0].length).trim()
  }
  return total
}

/**
 * `--since` accepts an ISO time or a duration back from now (`--since 2h`),
 * since the second is what a person types and the first is what `decs wait`
 * prints for an agent to paste.
 */
export function parseSince(raw: string, now = Date.now()): string {
  if (!Number.isNaN(Date.parse(raw)) && /\d{4}-\d{2}-\d{2}/.test(raw)) return raw
  return new Date(now - parseDuration(raw)).toISOString()
}
