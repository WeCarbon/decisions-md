#!/usr/bin/env node
// What `monitors/monitors.json` runs instead of naming bin/decs.ts directly —
// see plugin/resolve.mjs for why.
import { moduleUrl } from './resolve.mjs'

const { main } = await import(moduleUrl('bin', 'decs.ts'))
process.exitCode = await main(process.argv.slice(2))
