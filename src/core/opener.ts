/**
 * The OS command that opens a path or URL in its default viewer/app —
 * shared by `decs open` and the bench's own "o" key.
 *
 * `start` (win32) is a cmd.exe builtin, not an executable: `spawn('start',
 * …)` without a shell fails with ENOENT, since there is no `start.exe`
 * anywhere to find on PATH. Routing through `cmd.exe /c` is the standard
 * fix. The empty `""` after it is required too — `start`'s first quoted
 * argument is a window title, and without that placeholder a target whose
 * path contains spaces gets misread as the title instead.
 */
export interface OpenCommand {
  command: string
  args: string[]
  /** Extra `spawn` options this command needs, merged over the caller's own. */
  options?: { windowsVerbatimArguments?: boolean }
}

export function openerFor(target: string, platform: NodeJS.Platform = process.platform): OpenCommand {
  if (platform === 'darwin') return { command: 'open', args: [target] }
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/c', 'start', '""', target], options: { windowsVerbatimArguments: true } }
  return { command: 'xdg-open', args: [target] }
}
