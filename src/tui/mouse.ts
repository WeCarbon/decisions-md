/**
 * SGR mouse reporting. Ink passes the escape sequence through as plain
 * `input` with no key flags set, so parsing it in `useInput` is safe.
 */
export interface MouseEvent {
  kind: 'wheel-up' | 'wheel-down' | 'press' | 'release'
  /** 1-based, as the terminal reports them. */
  x: number
  y: number
  button: number
}

const SGR = /^\[<(\d+);(\d+);(\d+)([Mm])$/

export function parseMouse(input: string): MouseEvent | null {
  const m = SGR.exec(input)
  if (!m) return null
  const [button, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const kind =
    button === 64 ? 'wheel-up' : button === 65 ? 'wheel-down' : m[4] === 'M' ? 'press' : 'release'
  return { kind, x, y, button }
}

/** True for anything that is a mouse report, so key handling can skip it. */
export function isMouse(input: string): boolean {
  return SGR.test(input)
}

/** 1000 = press/release, 1006 = SGR coordinates (needed past column 223). */
export const MOUSE_ON = '\x1b[?1000h\x1b[?1006h'
export const MOUSE_OFF = '\x1b[?1006l\x1b[?1000l'
