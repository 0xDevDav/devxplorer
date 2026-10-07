/*
 * Minimal EXIF reader for JPEG and HEIC photos: capture date, camera, lens, exposure and size.
 * Only the first part of the file is read (EXIF lives in the header of both formats), and the
 * TIFF structure inside it is decoded directly, with no external dependency.
 */
const fsp = require('fs').promises

const HEAD_BYTES = 256 * 1024
const PHOTO_EXT = /\.(jpe?g|heic|heif)$/i

const TAGS = {
  0x010f: 'make',
  0x0110: 'model',
  0x8769: 'exifPointer',
  0x829a: 'exposure',
  0x829d: 'fNumber',
  0x8827: 'iso',
  0x9003: 'taken',
  0x920a: 'focalLength',
  0xa002: 'width',
  0xa003: 'height',
  0xa434: 'lens',
}
const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

async function readHead(p, length = HEAD_BYTES, position = 0) {
  const fh = await fsp.open(p)
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(length), 0, length, position)
    return buffer.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

/* ---------- TIFF / EXIF ---------- */

function parseTiff(buf) {
  if (buf.length < 8) return {}
  const little = buf.toString('latin1', 0, 2) === 'II'
  const u16 = o => little ? buf.readUInt16LE(o) : buf.readUInt16BE(o)
  const u32 = o => little ? buf.readUInt32LE(o) : buf.readUInt32BE(o)
  const out = {}

  const readIfd = offset => {
    if (offset + 2 > buf.length) return
    const count = u16(offset)
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12
      if (entry + 12 > buf.length) return
      const name = TAGS[u16(entry)]
      if (!name) continue
      const type = u16(entry + 2)
      const n = u32(entry + 4)
      const size = (TYPE_SIZES[type] || 1) * n
      const at = size <= 4 ? entry + 8 : u32(entry + 8)
      if (at + size > buf.length) continue
      if (type === 2) out[name] = buf.toString('latin1', at, at + n).replace(/\0.*$/s, '').trim()
      else if (type === 3) out[name] = u16(at)
      else if (type === 4) out[name] = u32(at)
      else if (type === 5 || type === 10) out[name] = u32(at) / (u32(at + 4) || 1)
    }
  }

  readIfd(u32(4))
  if (out.exifPointer) readIfd(out.exifPointer)
  delete out.exifPointer
  if (out.taken) {
    const m = out.taken.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/)
    out.taken = m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : undefined
  }
  return out
}

/* ---------- JPEG ---------- */

function exifFromJpeg(buf) {
  const info = {}
  let offset = 2
  while (offset + 4 <= buf.length && buf[offset] === 0xff) {
    const marker = buf[offset + 1]
    const length = buf.readUInt16BE(offset + 2)
    if (marker === 0xe1 && buf.toString('latin1', offset + 4, offset + 10) === 'Exif\0\0') {
      Object.assign(info, parseTiff(buf.subarray(offset + 10, offset + 2 + length)))
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      info.height ??= buf.readUInt16BE(offset + 5)
      info.width ??= buf.readUInt16BE(offset + 7)
      break
    }
    offset += 2 + length
  }
  return info
}

/* ---------- HEIC (ISO base media file format) ---------- */

function* boxes(buf, start, end) {
  let offset = start
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset)
    const type = buf.toString('latin1', offset + 4, offset + 8)
    let header = 8
    if (size === 1) { size = Number(buf.readBigUInt64BE(offset + 8)); header = 16 }
    if (size === 0) size = end - offset
    if (size < header) return
    yield { type, start: offset + header, end: Math.min(offset + size, end) }
    offset += size
  }
}

const findBox = (buf, start, end, type) => {
  for (const box of boxes(buf, start, end)) if (box.type === type) return box
  return null
}

function readSized(buf, offset, size) {
  if (size === 0) return 0
  if (size === 4) return buf.readUInt32BE(offset)
  if (size === 8) return Number(buf.readBigUInt64BE(offset))
  return buf.readUInt16BE(offset)
}

async function exifFromHeic(p, buf) {
  const meta = findBox(buf, 0, buf.length, 'meta')
  if (!meta) return {}
  const metaStart = meta.start + 4 // full box: version and flags
  const info = {}

  // the largest image spatial extent is the full-size picture
  const iprp = findBox(buf, metaStart, meta.end, 'iprp')
  const ipco = iprp && findBox(buf, iprp.start, iprp.end, 'ipco')
  if (ipco) {
    for (const box of boxes(buf, ipco.start, ipco.end)) {
      if (box.type !== 'ispe') continue
      const w = buf.readUInt32BE(box.start + 4)
      const h = buf.readUInt32BE(box.start + 8)
      if (!info.width || w * h > info.width * info.height) Object.assign(info, { width: w, height: h })
    }
  }

  // item id of the EXIF block
  const iinf = findBox(buf, metaStart, meta.end, 'iinf')
  if (!iinf) return info
  const iinfVersion = buf[iinf.start]
  let exifId = null
  for (const infe of boxes(buf, iinf.start + 4 + (iinfVersion === 0 ? 2 : 4), iinf.end)) {
    const version = buf[infe.start]
    if (infe.type !== 'infe' || version < 2) continue
    const idSize = version === 2 ? 2 : 4
    const id = readSized(buf, infe.start + 4, idSize)
    if (buf.toString('latin1', infe.start + 4 + idSize + 2, infe.start + 8 + idSize + 2) === 'Exif') { exifId = id; break }
  }
  if (exifId === null) return info

  // its location in the file
  const iloc = findBox(buf, metaStart, meta.end, 'iloc')
  if (!iloc) return info
  const version = buf[iloc.start]
  let o = iloc.start + 4
  const offsetSize = buf[o] >> 4
  const lengthSize = buf[o] & 15
  const baseOffsetSize = buf[o + 1] >> 4
  const indexSize = version > 0 ? buf[o + 1] & 15 : 0
  o += 2
  const itemCount = version < 2 ? buf.readUInt16BE(o) : buf.readUInt32BE(o)
  o += version < 2 ? 2 : 4
  for (let i = 0; i < itemCount; i++) {
    const id = version < 2 ? buf.readUInt16BE(o) : buf.readUInt32BE(o)
    o += version < 2 ? 2 : 4
    if (version > 0) o += 2 // construction method
    o += 2 // data reference index
    const base = readSized(buf, o, baseOffsetSize)
    o += baseOffsetSize
    const extents = buf.readUInt16BE(o)
    o += 2
    for (let e = 0; e < extents; e++) {
      o += indexSize
      const extentOffset = readSized(buf, o, offsetSize)
      o += offsetSize
      const extentLength = readSized(buf, o, lengthSize)
      o += lengthSize
      if (id !== exifId || e > 0) continue
      const block = await readHead(p, extentLength, base + extentOffset)
      const tiffStart = 4 + block.readUInt32BE(0)
      Object.assign(info, parseTiff(block.subarray(tiffStart)), { width: info.width, height: info.height })
      return info
    }
  }
  return info
}

/* ---------- public API ---------- */

const cache = new Map()

// Returns { taken, make, model, lens, exposure, fNumber, iso, focalLength, width, height } (fields optional).
async function photoInfo(p, mtime) {
  if (!PHOTO_EXT.test(p)) return null
  const key = p + '|' + mtime
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const buf = await readHead(p)
        return buf[0] === 0xff && buf[1] === 0xd8 ? exifFromJpeg(buf) : await exifFromHeic(p, buf)
      } catch { return {} }
    })())
  }
  return cache.get(key)
}

module.exports = { photoInfo, PHOTO_EXT }
