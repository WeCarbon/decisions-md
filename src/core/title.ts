import stringWidth from 'string-width'
import { t } from '../i18n/index.ts'

/**
 * How wide a title may be, in terminal columns (CJK counts two, ~16 汉字).
 * The bench truncates longer titles with 「…」, so everything beyond a
 * short phrase naming what to decide belongs in the body.
 */
export const TITLE_MAX_COLS = 32

export function titleWidth(title: string): number {
  return stringWidth(title.trim())
}

/** Null when the title fits; otherwise the message to refuse it with. */
export function titleProblem(title: string, max = TITLE_MAX_COLS): string | null {
  const w = titleWidth(title)
  if (w <= max) return null
  return t('core.title.tooLong', { width: w, max, half: Math.floor(max / 2), title: title.trim() })
}

/** Throws the refusal; for `decs add`, `decs retitle`, and task titles alike. */
export function assertTitleFits(title: string, max = TITLE_MAX_COLS): void {
  const problem = titleProblem(title, max)
  if (problem) throw new Error(problem)
}
