// Usage: node scripts/fr-typography.ts — puts a no-break space before : ; ? ! » and after « in the French locale files.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../src/i18n/locales/fr/', import.meta.url))

function frenchSpacing(s: string): string {
  return s.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ')
}

for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = join(dir, f)
  const before = readFileSync(path, 'utf8')
  const after = frenchSpacing(before)
  if (after !== before) {
    writeFileSync(path, after)
    console.log(`fixed ${f}`)
  }
}
