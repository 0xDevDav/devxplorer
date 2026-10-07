const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { photoInfo } = require('../src/main/exif')

// Builds a little-endian TIFF block with IFD0 (Make, Exif pointer) and an Exif IFD
// (DateTimeOriginal, ISO, FNumber).
function tiffBlock() {
  const make = Buffer.from('Test\0', 'latin1')
  const date = Buffer.from('2024:05:17 09:30:15\0', 'latin1')
  const buf = Buffer.alloc(200)
  buf.write('II', 0, 'latin1')
  buf.writeUInt16LE(42, 2)
  buf.writeUInt32LE(8, 4)

  const ifd0 = 8
  const exifIfd = ifd0 + 2 + 2 * 12 + 4
  const data = exifIfd + 2 + 3 * 12 + 4
  const entry = (at, tag, type, count, value) => {
    buf.writeUInt16LE(tag, at)
    buf.writeUInt16LE(type, at + 2)
    buf.writeUInt32LE(count, at + 4)
    buf.writeUInt32LE(value, at + 8)
  }

  buf.writeUInt16LE(2, ifd0)
  entry(ifd0 + 2, 0x010f, 2, make.length, data)
  entry(ifd0 + 14, 0x8769, 4, 1, exifIfd)
  make.copy(buf, data)

  buf.writeUInt16LE(3, exifIfd)
  entry(exifIfd + 2, 0x9003, 2, date.length, data + 8)
  entry(exifIfd + 14, 0x8827, 3, 1, 200)
  entry(exifIfd + 26, 0x829d, 5, 1, data + 32)
  date.copy(buf, data + 8)
  buf.writeUInt32LE(28, data + 32)
  buf.writeUInt32LE(10, data + 36)
  return buf
}

function jpegWithExif() {
  const tiff = tiffBlock()
  const app1 = Buffer.alloc(4)
  app1.writeUInt16BE(0xffe1, 0)
  app1.writeUInt16BE(2 + 6 + tiff.length, 2)
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from('Exif\0\0', 'latin1'), tiff, sof, Buffer.alloc(16)])
}

test('reads capture date, camera and exposure from a JPEG', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'devxplorer-exif-')), 'photo.jpg')
  fs.writeFileSync(file, jpegWithExif())
  const info = await photoInfo(file, 1)
  fs.rmSync(path.dirname(file), { recursive: true })

  assert.equal(info.make, 'Test')
  assert.equal(info.iso, 200)
  assert.equal(info.fNumber, 2.8)
  assert.equal(info.taken, new Date(2024, 4, 17, 9, 30, 15).getTime())
  assert.deepEqual([info.width, info.height], [800, 600])
})

test('ignores files that are not photos', async () => {
  assert.equal(await photoInfo('notes.txt', 1), null)
})
