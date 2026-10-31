import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renameRetrying } from './lock.ts'
import type { Layout } from './paths.ts'

/**
 * The delivery queue: decision numbers the owner has acted on that no agent
 * has collected yet, oldest first (FIFO, no timestamps needed). One small
 * file rather than a flag per entry, since `decs wait` polls it often.
 */
export interface QueueFile {
  queue: number[]
}

const queuePath = (l: Layout) => join(l.root, 'queue.json')
const lockPath = (l: Layout) => join(l.root, '.queue.lock')

export function readQueue(l: Layout): number[] {
  try {
    const raw = JSON.parse(readFileSync(queuePath(l), 'utf8')) as Partial<QueueFile>
    if (!Array.isArray(raw.queue)) return []
    return raw.queue.filter((n) => Number.isInteger(n))
  } catch {
    // Missing is the normal empty state; corrupt should not stop the tool from
    // working, and the next write rebuilds the file.
    return []
  }
}

function writeQueue(l: Layout, ids: number[]): void {
  mkdirSync(l.root, { recursive: true })
  const tmp = `${queuePath(l)}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ queue: ids }, null, 2)}\n`)
  renameRetrying(tmp, queuePath(l))
}

/**
 * Read-modify-write under an exclusive lock, so two lanes popping at once
 * can't both collect the same answer.
 */
export function withQueue(l: Layout, mutate: (ids: number[]) => number[]): number[] {
  mkdirSync(l.root, { recursive: true })
  const lock = lockPath(l)
  const deadline = Date.now() + 5000

  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'))
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      if (Date.now() > deadline) {
        // A crashed process can leave the lock behind; after five seconds the
        // safer failure is to proceed than to wedge every agent on the machine.
        rmSync(lock, { force: true })
        continue
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }

  try {
    const next = mutate(readQueue(l))
    writeQueue(l, [...new Set(next)])
    return next
  } finally {
    rmSync(lock, { force: true })
  }
}

export function enqueue(l: Layout, id: number): void {
  withQueue(l, (ids) => (ids.includes(id) ? ids : [...ids, id]))
}

export function dequeue(l: Layout, id: number): void {
  withQueue(l, (ids) => ids.filter((n) => n !== id))
}

export function queueExists(l: Layout): boolean {
  return existsSync(queuePath(l))
}
