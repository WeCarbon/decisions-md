import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { settingValue } from '../core/settings.ts'
import { t } from '../i18n/index.ts'
import { cropPixels, decodePng, encodePng, type DecodedImage } from './png.ts'
import type { CropRect } from './zoom.ts'

export type ImageProtocol = 'iterm' | 'kitty'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$/i

export function looksLikeImage(path: string): boolean {
  return IMAGE_EXT.test(path.split(/[?#]/)[0])
}

/**
 * Which inline-image protocol this terminal speaks, if any. Conservative on
 * purpose: an unsupported escape sequence dumps base64 into scrollback.
 */
export function imageProtocol(env: NodeJS.ProcessEnv = process.env): ImageProtocol | null {
  const chosen = settingValue('images', env).value
  if (chosen === 'off') return null
  if (chosen === 'iterm' || chosen === 'kitty') return chosen
  // Both protocols are escape sequences the multiplexer swallows unless
  // passthrough is configured, and a half-passed sequence corrupts the screen.
  if (env.TMUX || env.STY) return null
  if (env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty' || env.GHOSTTY_RESOURCES_DIR) return 'kitty'
  if (env.TERM_PROGRAM === 'iTerm.app' || env.LC_TERMINAL === 'iTerm2' || env.WEZTERM_PANE) return 'iterm'
  return null
}

export interface ImageOptions {
  /** Cell width; `auto` lets the terminal decide from the pixel size. */
  cols?: number
  rows?: number
  name?: string
}

/** iTerm2 / WezTerm: OSC 1337 with the whole file base64-encoded in one go. */
function encodeIterm(data: Buffer, opts: ImageOptions): string {
  const args = [
    `size=${data.length}`,
    `name=${Buffer.from(opts.name ?? 'image').toString('base64')}`,
    'inline=1',
    'preserveAspectRatio=1',
  ]
  if (opts.cols) args.push(`width=${opts.cols}`)
  if (opts.rows) args.push(`height=${opts.rows}`)
  return `\x1b]1337;File=${args.join(';')}:${data.toString('base64')}\x07`
}

/**
 * Kitty graphics protocol: base64 split into 4096-byte chunks, `m=1` on every
 * chunk but the last.
 */
function encodeKitty(data: Buffer, opts: ImageOptions): string {
  const b64 = data.toString('base64')
  const chunks: string[] = []
  const controls = ['a=T', 'f=100']
  if (opts.cols) controls.push(`c=${opts.cols}`)
  if (opts.rows) controls.push(`r=${opts.rows}`)

  for (let i = 0; i < b64.length; i += 4096) {
    const piece = b64.slice(i, i + 4096)
    const more = i + 4096 < b64.length ? 1 : 0
    const head = i === 0 ? [...controls, `m=${more}`] : [`m=${more}`]
    chunks.push(`\x1b_G${head.join(',')};${piece}\x1b\\`)
  }
  return chunks.join('')
}

/** Files this big are almost never worth the latency of pushing through a pty. */
const MAX_BYTES = 8 * 1024 * 1024

export interface RenderResult {
  sequence: string
  /** Why nothing was drawn, when `sequence` is empty. */
  reason?: string
}

/** Encodes already-in-memory bytes — the path cropping/zooming takes. */
export function renderImageData(data: Buffer, opts: ImageOptions = {}, protocol = imageProtocol()): RenderResult {
  if (!protocol) return { sequence: '', reason: t('bench.image.unsupportedTerminal') }
  const withName = { ...opts, name: opts.name ?? 'image' }
  return { sequence: protocol === 'kitty' ? encodeKitty(data, withName) : encodeIterm(data, withName) }
}

export function renderImage(path: string, opts: ImageOptions = {}, protocol = imageProtocol()): RenderResult {
  if (!protocol) return { sequence: '', reason: t('bench.image.unsupportedTerminal') }
  if (!looksLikeImage(path)) return { sequence: '', reason: t('bench.image.notAnImage', { ext: extname(path) || path }) }

  let data: Buffer
  try {
    if (statSync(path).size > MAX_BYTES) return { sequence: '', reason: t('bench.image.tooBig') }
    data = readFileSync(path)
  } catch (e) {
    return { sequence: '', reason: (e as Error).message }
  }

  return renderImageData(data, { ...opts, name: opts.name ?? basename(path) }, protocol)
}

/** Decodes an image for cropping, or `null` if the codec can't (only 8-bit,
 *  non-interlaced PNG). No caching — the caller owns the lifetime. */
export function loadForCrop(path: string): DecodedImage | null {
  try {
    if (statSync(path).size > MAX_BYTES) return null
    return decodePng(readFileSync(path))
  } catch {
    return null
  }
}

/** Crops a decoded image to `rect` and re-encodes it as a fresh PNG. */
export function cropToPng(image: DecodedImage, rect: CropRect): Buffer {
  return encodePng(cropPixels(image, rect.x, rect.y, rect.width, rect.height))
}

/** Erases any graphics the Kitty protocol placed; a no-op elsewhere. */
export function clearImages(protocol = imageProtocol()): string {
  return protocol === 'kitty' ? '\x1b_Ga=d\x1b\\' : ''
}
