/**
 * decs → Noddit: every `DECS_*` environment variable keeps working under its
 * `NODDIT_*` name. Reads check `NODDIT_<suffix>` first, then fall back to
 * `DECS_<suffix>` — the owner's machine, other projects and already-running
 * agents all still set `DECS_*`. Use these instead of reading
 * `process.env.DECS_*` / `process.env.NODDIT_*` directly, so the two names
 * never drift apart.
 */

/** Which variable actually supplied a value, and what it was. */
export interface EnvHit {
  name: string
  value: string
}

/**
 * `NODDIT_<suffix>` if it is set (even to `''`), else `DECS_<suffix>` the
 * same way, else `undefined` when neither is set at all.
 */
export function nodditEnvHit(suffix: string, env: NodeJS.ProcessEnv = process.env): EnvHit | undefined {
  const nodditName = `NODDIT_${suffix}`
  if (env[nodditName] !== undefined) return { name: nodditName, value: env[nodditName]! }
  const decsName = `DECS_${suffix}`
  if (env[decsName] !== undefined) return { name: decsName, value: env[decsName]! }
  return undefined
}

/** Just the value `nodditEnvHit` would find, or `undefined`. */
export function nodditEnv(suffix: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nodditEnvHit(suffix, env)?.value
}

/**
 * `NODDIT_NODE`/`DECS_NODE`, then `NODDIT_TASK`/`DECS_TASK` — `TASK` was
 * `NODE`'s legacy alias before the rename and keeps working behind it.
 */
export function nodditNodeEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return nodditEnv('NODE', env) ?? nodditEnv('TASK', env)
}

/**
 * Sets `value` on a child process's env under both `NODDIT_<suffix>` and
 * `DECS_<suffix>`, so a notify command or hook reading either name sees it.
 */
export function setNodditEnv(env: NodeJS.ProcessEnv, suffix: string, value: string): void {
  env[`NODDIT_${suffix}`] = value
  env[`DECS_${suffix}`] = value
}
