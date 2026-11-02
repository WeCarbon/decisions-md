import type { MenuItem } from './menu.tsx'

/** The key hint the window shows, as an accelerator the OS menu draws in its own style. */
function accelerator(shortcut: string | undefined): string | undefined {
  if (!shortcut) return undefined
  if (/^[A-Z0-9]$/i.test(shortcut)) return shortcut.toUpperCase()
  const named: Record<string, string> = { '⏎': 'Enter', '←': 'ArrowLeft', '→': 'ArrowRight', '⇧F10': 'Shift+F10' }
  return named[shortcut]
}

type Native = typeof import('@tauri-apps/api/menu')

async function build(m: Native, items: MenuItem[]): Promise<unknown[]> {
  const out: unknown[] = []
  for (const item of items) {
    if (item.kind === 'separator') {
      out.push(await m.PredefinedMenuItem.new({ item: 'Separator' }))
      continue
    }
    if (item.kind === 'header') {
      out.push(await m.MenuItem.new({ text: item.label, enabled: false }))
      continue
    }
    if (item.sub) {
      out.push(await m.Submenu.new({ text: item.label, enabled: !item.disabled, items: (await build(m, item.sub)) as never }))
      continue
    }
    const common = { text: item.label, enabled: !item.disabled, accelerator: accelerator(item.shortcut), action: () => item.run?.() }
    out.push(item.checked !== undefined ? await m.CheckMenuItem.new({ ...common, checked: item.checked }) : await m.MenuItem.new(common))
  }
  return out
}

/**
 * The menu the OS draws: system font, vibrancy, highlight and shortcut glyphs on macOS,
 * the Windows 11 look on Windows — nothing to imitate. Returns false if it cannot be shown.
 */
export async function popupNative(items: MenuItem[], x: number, y: number): Promise<boolean> {
  try {
    const m = await import('@tauri-apps/api/menu')
    const { LogicalPosition } = await import('@tauri-apps/api/dpi')
    const menu = await m.Menu.new({ items: (await build(m, items)) as never })
    await menu.popup(new LogicalPosition(x, y))
    return true
  } catch {
    return false
  }
}
