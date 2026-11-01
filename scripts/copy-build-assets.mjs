#!/usr/bin/env node
// `tsc` only emits compiled .ts/.tsx; it never touches the i18n locale JSON
// (loaded at runtime via readdirSync/readFileSync, not import) or the
// executable bit a published bin needs. Run after `tsc -p tsconfig.build.json`.
import { chmodSync, cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(repoRoot, 'dist')

cpSync(join(repoRoot, 'src', 'i18n', 'locales'), join(dist, 'src', 'i18n', 'locales'), { recursive: true })

for (const name of ['nod.js', 'decs.js']) {
  const bin = join(dist, 'bin', name)
  if (!existsSync(bin)) throw new Error(`build did not produce ${bin}`)
  chmodSync(bin, 0o755)
}
