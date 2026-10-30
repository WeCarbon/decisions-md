import { t } from '../i18n/index.ts'

/**
 * Zoom/pan state for the image preview. `zoom` 1 = "fit" (whole image).
 * `cx`/`cy` are the visible rectangle's centre as a fraction of the image's
 * width/height.
 */
export interface ZoomState {
  zoom: number
  cx: number
  cy: number
}

export const ZOOM_MIN = 1
export const ZOOM_MAX = 8
const ZOOM_STEP = 1.5
/** Each pan press moves the view by this fraction of what's currently visible. */
const PAN_FRACTION = 0.3

export const RESET: ZoomState = { zoom: ZOOM_MIN, cx: 0.5, cy: 0.5 }

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function zoomIn(state: ZoomState): ZoomState {
  return { ...state, zoom: clamp(state.zoom * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) }
}

/** Dropping back to the minimum also re-centres — there is nothing left to pan. */
export function zoomOut(state: ZoomState): ZoomState {
  const zoom = clamp(state.zoom / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX)
  return zoom <= ZOOM_MIN ? RESET : { ...state, zoom }
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** The visible rectangle, in source-image pixels, for the current state. */
export function cropRect(state: ZoomState, imageWidth: number, imageHeight: number): CropRect {
  const width = clamp(Math.round(imageWidth / state.zoom), 1, imageWidth)
  const height = clamp(Math.round(imageHeight / state.zoom), 1, imageHeight)
  const maxX = imageWidth - width
  const maxY = imageHeight - height
  const x = clamp(Math.round(state.cx * imageWidth - width / 2), 0, maxX)
  const y = clamp(Math.round(state.cy * imageHeight - height / 2), 0, maxY)
  return { x, y, width, height }
}

/** Moves the visible rectangle by `dx`/`dy` steps (-1/0/1, one arrow press); no-op at "fit". */
export function pan(state: ZoomState, dx: number, dy: number, imageWidth: number, imageHeight: number): ZoomState {
  if (state.zoom <= ZOOM_MIN || (!dx && !dy)) return state
  const rect = cropRect(state, imageWidth, imageHeight)
  const maxX = imageWidth - rect.width
  const maxY = imageHeight - rect.height
  if (maxX <= 0 && maxY <= 0) return state

  const stepX = Math.max(1, Math.round(rect.width * PAN_FRACTION))
  const stepY = Math.max(1, Math.round(rect.height * PAN_FRACTION))
  const x = clamp(rect.x + dx * stepX, 0, maxX)
  const y = clamp(rect.y + dy * stepY, 0, maxY)

  return {
    ...state,
    cx: maxX === 0 ? state.cx : (x + rect.width / 2) / imageWidth,
    cy: maxY === 0 ? state.cy : (y + rect.height / 2) / imageHeight,
  }
}

/** The one-line footer shown while previewing an image. */
export function zoomHintText(state: ZoomState, zoomable: boolean, multi = false): string {
  const pct = `${Math.round(state.zoom * 100)}%`
  const flip = multi ? t('bench.zoom.switchImages') : ''
  if (!zoomable) return t('bench.zoom.unsupported', { flip })
  const move = state.zoom > ZOOM_MIN ? t('bench.zoom.moveArrows') : t('bench.zoom.moveArrowsVertical', { flip })
  return t('bench.zoom.hint', { move, pct })
}

/**
 * Where a big-view image lands inside the box bench reserves, once the
 * terminal scales it to fit by the narrower dimension (`preserveAspectRatio=1`).
 * A tall narrow image leaves a sliver of unused width; `imageLayout` says how
 * wide that sliver is so bench can put a caption/label there.
 */
export interface ImageLayout {
  /** Cell size the image itself will actually occupy — always ≤ the box. */
  imageCols: number
  imageRows: number
  /** Column, 0-based within the box, where the leftover panel starts. Equals `imageCols` (plus the one-column gap) whenever `textCols` is non-zero. */
  textX: number
  /** Columns left over for a caption/label panel. 0 when the image already fills the box's width (nothing to its right). */
  textCols: number
  textRows: number
}

/**
 * `cellAspect`: how much wider than tall one cell renders (~2:1), so a pixel
 * ratio must be scaled to cell units before comparing against a box in cells.
 */
export function imageLayout(
  imageWidthPx: number,
  imageHeightPx: number,
  boxCols: number,
  boxRows: number,
  cellAspect = 0.5,
): ImageLayout {
  const cols = Math.max(0, Math.floor(boxCols))
  const rows = Math.max(0, Math.floor(boxRows))
  if (imageWidthPx <= 0 || imageHeightPx <= 0 || cols <= 0 || rows <= 0) {
    return { imageCols: cols, imageRows: rows, textX: cols, textCols: 0, textRows: rows }
  }

  // A cell is ~half as wide as tall, so divide (not multiply) by its
  // width:height to get columns-per-row of image.
  const cellRatio = imageWidthPx / imageHeightPx / cellAspect

  // Fill height first (as preserveAspectRatio does); fall back to width if that overflows.
  let imageRows = rows
  let imageCols = Math.max(1, Math.round(imageRows * cellRatio))
  if (imageCols > cols) {
    imageCols = cols
    imageRows = Math.max(1, Math.min(rows, Math.round(imageCols / cellRatio)))
  }

  const gap = imageCols < cols ? 1 : 0
  const textCols = Math.max(0, cols - imageCols - gap)
  return { imageCols, imageRows, textX: cols - textCols, textCols, textRows: rows }
}
