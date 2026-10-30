import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BIN = fileURLToPath(new URL('../bin/decs.ts', import.meta.url))

export function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'decs-test-'))
}

/** Runs the CLI synchronously in `cwd`. `input` goes to stdin; empty by default, so a command that waits on it never hangs the test. */
export function decs(cwd: string, args: string[], env: Record<string, string | undefined> = {}, input = ''): string {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    // CLAUDECODE pinned so the default note role does not depend on which
    // shell runs the suite; a test passes `CLAUDECODE: undefined` to unset it.
    env: withoutUndefined({ ...process.env, NO_COLOR: '1', DECS_AUTHOR: 'cli-test · lane', DECS_LANG: 'en', CLAUDECODE: '1', DECS_ROLE: undefined, ...env }),
    encoding: 'utf8',
    input,
  })
}

function withoutUndefined(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined))
}

/** Like `decs`, but hands back the exit code and both streams instead of throwing. */
export function decsResult(
  cwd: string,
  args: string[],
  env: Record<string, string | undefined> = {},
  input = '',
): { code: number; stdout: string; stderr: string } {
  try {
    return { code: 0, stdout: decs(cwd, args, env, input), stderr: '' }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, stdout: err.stdout, stderr: err.stderr }
  }
}

/** The same, as a child process — for tests that need several at once. */
export function decsAsync(cwd: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, DECS_LANG: 'en', CLAUDECODE: '1' },
    })
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })
}
