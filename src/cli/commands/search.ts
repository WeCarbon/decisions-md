import { bool, one, type Args } from '../args.ts'
import { resolveStore } from '../context.ts'
import { dim, summaryLine, toJSON, yellow } from '../../core/render.ts'
import { t } from '../../i18n/index.ts'

const help = () => t('cli.help.search')

export function run(args: Args): number {
  if (bool(args, 'help', 'h') || !args._.length) {
    console.log(help())
    return args._.length ? 0 : 1
  }
  const words = args._.map((w) => w.toLowerCase())
  const store = resolveStore(args, { allowRegistry: true })
  const project = one(args, 'project', 'p')
  const hits = store
    .all()
    .filter((d) => bool(args, 'all') || !d.archived)
    .filter((d) => !project || d.project === store.projectKey(project))
    .filter((d) => {
      const hay = [d.title, d.body, ...d.attachments.map((a) => `${a.label} ${a.target}`)].join('\n').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => (b.updatedAt ?? b.created).localeCompare(a.updatedAt ?? a.created))

  if (bool(args, 'json')) {
    console.log(JSON.stringify(hits.map(toJSON)))
    return 0
  }
  if (!hits.length) {
    console.log(t('cli.search.noneFound', { query: args._.join(' '), hint: bool(args, 'all') ? '' : dim(t('cli.search.activeOnlyHint')) }))
    return 0
  }
  for (const d of hits) {
    console.log(summaryLine(d, { project: store.layouts.length > 1 }))
    // One line of context around the first hit, so the list is skimmable.
    const line = d.body.split('\n').find((l) => l.toLowerCase().includes(words[0]))
    if (line) {
      const i = line.toLowerCase().indexOf(words[0])
      const start = Math.max(0, i - 30)
      const snippet = line.slice(start, i + words[0].length + 50).trim()
      console.log(`    ${dim(start ? '…' : '')}${snippet.replace(new RegExp(words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), (m) => yellow(m))}`)
    }
  }
  return 0
}
