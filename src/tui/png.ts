import { deflateSync, inflateSync } from 'node:zlib'

/**
 * A minimal PNG codec: decodes the screenshots `decs attach` sees (8-bit,
 * non-interlaced) to RGBA and re-encodes a cropped rectangle back. Not a
 * general library — `node:zlib` does DEFLATE; anything outside scope
 * (16-bit depth, interlacing, APNG) returns `null` rather than guessing.
 */
export interface DecodedImage {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, row-major, no padding. */
  data: Buffer
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

interface Chunk {
  type: string
  data: Buffer
}

function readChunks(buf: Buffer): Chunk[] {
  const chunks: Chunk[] = []
  let pos = SIGNATURE.length
  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const dataStart = pos + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buf.length) break
    chunks.push({ type, data: buf.subarray(dataStart, dataEnd) })
    pos = dataEnd + 4 // skip the trailing CRC
    if (type === 'IEND') break
  }
  return chunks
}

function writeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

/** Channels per pixel for each PNG colour type this codec understands. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Reverses the per-scanline filter PNG applies before DEFLATE, in place. */
function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const bpp = channels // 8-bit depth only, so bytes-per-pixel == channels
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let srcPos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[srcPos++]
    const rowStart = y * stride
    const prevRowStart = rowStart - stride
    for (let x = 0; x < stride; x++) {
      const raw_ = raw[srcPos++]
      const a = x >= bpp ? out[rowStart + x - bpp] : 0
      const b = y > 0 ? out[prevRowStart + x] : 0
      const c = y > 0 && x >= bpp ? out[prevRowStart + x - bpp] : 0
      let value: number
      switch (filter) {
        case 0:
          value = raw_
          break
        case 1:
          value = raw_ + a
          break
        case 2:
          value = raw_ + b
          break
        case 3:
          value = raw_ + Math.floor((a + b) / 2)
          break
        case 4:
          value = raw_ + paeth(a, b, c)
          break
        default:
          return out // unknown filter: bail with whatever was reconstructed so far
      }
      out[rowStart + x] = value & 0xff
    }
  }
  return out
}

/** Expands any supported colour type to flat RGBA. */
function toRgba(pixels: Buffer, width: number, height: number, colorType: number, palette: Buffer | null, trns: Buffer | null): Buffer {
  const out = Buffer.alloc(width * height * 4)
  const channels = CHANNELS[colorType]
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    let r = 0
    let g = 0
    let b = 0
    let a = 255
    if (colorType === 0) {
      r = g = b = pixels[s]
    } else if (colorType === 2) {
      r = pixels[s]
      g = pixels[s + 1]
      b = pixels[s + 2]
    } else if (colorType === 3) {
      const idx = pixels[s]
      if (!palette || idx * 3 + 2 >= palette.length) return out
      r = palette[idx * 3]
      g = palette[idx * 3 + 1]
      b = palette[idx * 3 + 2]
      a = trns && idx < trns.length ? trns[idx] : 255
    } else if (colorType === 4) {
      r = g = b = pixels[s]
      a = pixels[s + 1]
    } else if (colorType === 6) {
      r = pixels[s]
      g = pixels[s + 1]
      b = pixels[s + 2]
      a = pixels[s + 3]
    }
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = a
  }
  return out
}

/** Decodes a PNG into RGBA, or `null` if it is not a PNG this codec handles. */
export function decodePng(buf: Buffer): DecodedImage | null {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) return null
  try {
    const chunks = readChunks(buf)
    const ihdr = chunks.find((c) => c.type === 'IHDR')
    if (!ihdr || ihdr.data.length < 13) return null
    const width = ihdr.data.readUInt32BE(0)
    const height = ihdr.data.readUInt32BE(4)
    const bitDepth = ihdr.data[8]
    const colorType = ihdr.data[9]
    const interlace = ihdr.data[12]
    if (bitDepth !== 8 || interlace !== 0 || !(colorType in CHANNELS)) return null
    if (width <= 0 || height <= 0) return null

    const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))
    if (!idat.length) return null
    const raw = inflateSync(idat)

    const palette = colorType === 3 ? chunks.find((c) => c.type === 'PLTE')?.data ?? null : null
    const trns = chunks.find((c) => c.type === 'tRNS')?.data ?? null
    if (colorType === 3 && !palette) return null

    const channels = CHANNELS[colorType]
    const pixels = unfilter(raw, width, height, channels)
    const data = toRgba(pixels, width, height, colorType, palette, trns)
    return { width, height, data }
  } catch {
    return null
  }
}

/** Encodes RGBA back to PNG. Always 8-bit RGBA, filter type None — simplicity over size. */
export function encodePng(img: DecodedImage): Buffer {
  const { width, height, data } = img
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type None
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw)

  return Buffer.concat([SIGNATURE, writeChunk('IHDR', ihdr), writeChunk('IDAT', idat), writeChunk('IEND', Buffer.alloc(0))])
}

/** Copies a sub-rectangle of a decoded image into a new, independent image. */
export function cropPixels(img: DecodedImage, x: number, y: number, width: number, height: number): DecodedImage {
  const out = Buffer.alloc(width * height * 4)
  for (let row = 0; row < height; row++) {
    const srcStart = ((y + row) * img.width + x) * 4
    img.data.copy(out, row * width * 4, srcStart, srcStart + width * 4)
  }
  return { width, height, data: out }
}
