/**
 * The pure, testable half of `decs progress`: turning a line of some other
 * tool's output into a percentage, and throttling how often that gets
 * written to disk. `src/cli/commands/progress.ts` does the I/O.
 */

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export type ProgressParser = (line: string) => number | null

/** Built-in line parsers, picked with `--parse <name>`. */
export const PROGRESS_PARSERS: Record<string, ProgressParser> = {
  /** pytest's `-v`/default progress column: `tests/test_x.py::y PASSED [ 37%]`. */
  pytest: (line) => {
    const m = /\[\s*(\d{1,3})\s*%\]/.exec(line)
    return m ? clampPercent(Number(m[1])) : null
  },
  /** Any bare `NN%` in the line. */
  percent: (line) => {
    const m = /(\d{1,3})\s*%/.exec(line)
    return m ? clampPercent(Number(m[1])) : null
  },
  /** Any `N/M` in the line, e.g. "137/420". */
  fraction: (line) => {
    const m = /(\d+)\s*\/\s*(\d+)/.exec(line)
    if (!m) return null
    const total = Number(m[2])
    return total > 0 ? clampPercent((Number(m[1]) / total) * 100) : null
  },
}

/** Tries every built-in parser in turn — what `decs progress` uses with no `--parse`/`--regex`. */
export function parseAnyProgressLine(line: string): number | null {
  for (const p of Object.values(PROGRESS_PARSERS)) {
    const v = p(line)
    if (v !== null) return v
  }
  return null
}

/** Applies a user-supplied `--regex`: two groups are `N/M`, one is a literal percentage. */
export function percentFromRegex(regex: RegExp, line: string): number | null {
  const m = regex.exec(line)
  if (!m) return null
  if (m[1] !== undefined && m[2] !== undefined) {
    const total = Number(m[2])
    return total > 0 ? clampPercent((Number(m[1]) / total) * 100) : null
  }
  if (m[1] !== undefined) {
    const n = Number(m[1])
    return Number.isFinite(n) ? clampPercent(n) : null
  }
  return null
}

/** `--count-lines log.txt --total 23` — how far through N sections the current line count puts us. */
export function percentFromCount(count: number, total: number): number {
  return total > 0 ? clampPercent((count / total) * 100) : 0
}

export interface Throttle<T> {
  /** Offer a value. Writes immediately if the interval has elapsed; otherwise queues it as the trailing value. */
  push(value: T): void
  /** Forces the latest queued value to write now, if one is pending. Call this when the stream ends. */
  flush(): void
}

/**
 * At most one `write` per `intervalMs`, but the last value pushed always
 * lands eventually — writing on every single line would flood both git
 * and the terminal.
 */
export function createThrottle<T>(intervalMs: number, write: (value: T) => void): Throttle<T> {
  let lastWriteAt = 0
  let pending: T | undefined
  let hasPending = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const fire = (value: T) => {
    lastWriteAt = Date.now()
    hasPending = false
    write(value)
  }

  const push = (value: T) => {
    const now = Date.now()
    if (now - lastWriteAt >= intervalMs) {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      fire(value)
      return
    }
    pending = value
    hasPending = true
    if (!timer) {
      timer = setTimeout(() => {
        timer = undefined
        if (hasPending) fire(pending as T)
      }, intervalMs - (now - lastWriteAt))
    }
  }

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (hasPending) fire(pending as T)
  }

  return { push, flush }
}
