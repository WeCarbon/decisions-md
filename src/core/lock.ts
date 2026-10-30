import { closeSync, linkSync, mkdirSync, openSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Runs `fn` while holding an O_EXCL lockfile, shared across processes. A
 * lock older than `staleMs` is assumed abandoned by a dead process and
 * taken over.
 */
export function withFileLock<T>(lock: string, fn: () => T, opts: { staleMs?: number; waitMs?: number } = {}): T {
  const { staleMs = 10_000, waitMs = 30_000 } = opts
  mkdirSync(dirname(lock), { recursive: true })
  const deadline = Date.now() + waitMs

  for (;;) {
    try {
      const fd = openSync(lock, 'wx')
      writeSync(fd, `${process.pid}\n`)
      closeSync(fd)
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      let age = 0
      try {
        age = Date.now() - statSync(lock).mtimeMs
      } catch {
        continue // released between our open and our stat — just retry
      }
      if (age > staleMs || Date.now() > deadline) {
        rmSync(lock, { force: true })
        continue
      }
      sleep(10 + Math.floor(Math.random() * 20))
    }
  }

  try {
    return fn()
  } finally {
    rmSync(lock, { force: true })
  }
}

/** Replaces a file's contents atomically, so a concurrent reader never sees a half-written file. */
export function writeFileAtomic(path: string, data: string): void {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tmp, data)
  try {
    renameSync(tmp, path)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}

/** Creates a file that must not exist yet, atomically — content is already
 *  complete when the name appears. */
export function createFileAtomic(path: string, data: string): void {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tmp, data)
  try {
    linkSync(tmp, path)
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* already gone */
    }
  }
}
