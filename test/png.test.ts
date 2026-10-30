import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cropPixels, decodePng, encodePng } from '../src/tui/png.ts'

/** A small RGBA image with a distinct value in every channel of every pixel, so a crop that reads the wrong offset shows up immediately. */
function sample(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = x & 0xff
      data[i + 1] = y & 0xff
      data[i + 2] = (x + y) & 0xff
      data[i + 3] = 255
    }
  }
  return data
}

test('encodePng -> decodePng round-trips pixel data exactly', () => {
  for (const [w, h] of [[1, 1], [5, 3], [16, 16], [37, 1], [1, 29]]) {
    const data = sample(w, h)
    const decoded = decodePng(encodePng({ width: w, height: h, data }))
    assert.ok(decoded, `${w}x${h} failed to decode`)
    assert.equal(decoded!.width, w)
    assert.equal(decoded!.height, h)
    assert.ok(decoded!.data.equals(data), `${w}x${h} pixel data mismatch`)
  }
})

test('decodePng rejects anything that is not a PNG', () => {
  assert.equal(decodePng(Buffer.from('not a png')), null)
  assert.equal(decodePng(Buffer.alloc(0)), null)
  assert.equal(decodePng(Buffer.from([0x89, 0x50, 0x4e, 0x47])), null) // truncated signature
})

test('decodePng declines the fixture the image-protocol tests use, instead of decoding garbage', () => {
  // this fixture's IDAT has a bad zlib checksum; silently ignoring that would risk a truncated download decoding as a wrong picture
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAAhKDveWkH9passAAAAASUVORK5CYII=',
    'base64',
  )
  assert.equal(decodePng(png), null)
})

test('decodePng reads a grayscale PNG (colour type 0) from an independent encoder', () => {
  // Generated with Pillow: a 2x2 image with pixel values 10,20,30,40.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGPk4mIR4QIAAKQAOP8W/ggAAAAASUVORK5CYII=',
    'base64',
  )
  const decoded = decodePng(png)
  assert.ok(decoded, 'expected the grayscale sample to decode')
  assert.equal(decoded!.width, 2)
  assert.equal(decoded!.height, 2)
  assert.deepEqual([...decoded!.data], [10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255, 40, 40, 40, 255])
})

test('decodePng reads an 8-bit palette PNG (colour type 3) and expands it through PLTE', () => {
  // 2x2, palette [black, red, green, blue], pixels (0,0)=0 (1,0)=1 (0,1)=2 (1,1)=3
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAMAAABFaP0WAAAAP1BMVEUAAAD/AAAA/wAAAP8AAAABAQECAgIDAwMEBAQFBQUGBgYHBwcICAgJCQkKCgoLCwsMDAwNDQ0ODg4PDw8QEBAChegEAAAADklEQVR4nGNgYGRgYgYAABEAB56iKhIAAAAASUVORK5CYII=',
    'base64',
  )
  const decoded = decodePng(png)
  assert.ok(decoded, 'expected the palette sample to decode')
  assert.deepEqual(
    [...decoded!.data],
    [0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
  )
})

test('decodePng declines a palette PNG whose bit depth is below 8, rather than misreading it', () => {
  // same 2x2/4-colour image, but packed at 2 bits/pixel — outside what this codec's 8-bit-only unfilter handles
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAgMAAAAP2OW3AAAADFBMVEUAAAD/AAAA/wAAAP+bwBPcAAAADElEQVR4nGMQYNgAAADkAMEnqOhXAAAAAElFTkSuQmCC',
    'base64',
  )
  assert.equal(decodePng(png), null)
})

test('cropPixels extracts exactly the requested rectangle, not an off-by-one neighbour', () => {
  const width = 10
  const height = 10
  const data = sample(width, height)
  const img = { width, height, data }

  const full = cropPixels(img, 0, 0, width, height)
  assert.ok(full.data.equals(data), 'cropping the whole image must be a no-op')

  const corner = cropPixels(img, 7, 8, 3, 2)
  // Pixel (7,8) is channel R=7, G=8.
  assert.equal(corner.data[0], 7)
  assert.equal(corner.data[1], 8)
  // Pixel (9,9) — the far corner of the crop — must land at the end of the buffer.
  const last = (2 - 1) * 3 * 4 + (3 - 1) * 4
  assert.equal(corner.data[last], 9)
  assert.equal(corner.data[last + 1], 9)

  const single = cropPixels(img, 4, 4, 1, 1)
  assert.deepEqual([...single.data], [4, 4, 8, 255])
})

test('a cropped rectangle re-encodes and decodes back to the same pixels', () => {
  const width = 20
  const height = 12
  const data = sample(width, height)
  const img = { width, height, data }

  const rect = cropPixels(img, 3, 2, 10, 7)
  const decoded = decodePng(encodePng(rect))
  assert.ok(decoded)
  assert.equal(decoded!.width, 10)
  assert.equal(decoded!.height, 7)
  assert.ok(decoded!.data.equals(rect.data))
})
