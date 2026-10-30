// UserPromptSubmit: when the owner's message names a node (W305, X4, A12…),
// remind the model to log the owner's words onto that node before replying.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { moduleUrl } from './resolve.mjs'

const { t } = await import(moduleUrl('src', 'i18n', 'index.ts'))

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0)
}
const prompt = input.prompt ?? ''

function projectLetter(dir) {
  for (let d = dir; d && d !== dirname(d); d = dirname(d)) {
    try {
      return String(JSON.parse(readFileSync(join(d, 'decisions', 'decs.json'), 'utf8')).letter ?? '').toUpperCase()
    } catch {}
  }
  return ''
}

// One digit needs a known letter (X = no letter, D = legacy, or this project's), since Q1/F1 are common in prose.
const known = `XD${projectLetter(input.cwd ?? process.cwd())}`
const refs = [...new Set([...prompt.matchAll(/(?<![A-Za-z0-9])([A-Z])(\d{1,5})(?![A-Za-z0-9])/g)]
  .filter((m) => m[2].length > 1 || known.includes(m[1]))
  .map((m) => m[0]))]
if (!refs.length) process.exit(0)

const context = t('plugin.promptRefs.reminder', { refs: refs.join(' ') })
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
