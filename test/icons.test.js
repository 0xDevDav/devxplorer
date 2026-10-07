const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { exeIcon } = require('../src/main/icons')

test('extracts the largest icon of an executable', { skip: process.platform !== 'win32' }, async () => {
  const url = await exeIcon(process.execPath)
  const [head, body] = url.split(',')
  const data = Buffer.from(body, 'base64')
  if (head === 'data:image/png;base64') return assert.equal(data.readUInt32BE(16), 256, 'node ships a 256px icon')
  assert.equal(head, 'data:image/x-icon;base64')
  assert.equal(data.readUInt16LE(4), 1)
  assert.equal(data.readUInt32LE(14), data.length - 22)
  assert.equal(data[6], 0, 'node ships a 256px icon, stored as width 0')
})

test('returns null for files without icon resources', async () => {
  const file = path.join(os.tmpdir(), 'devxplorer-not-an-exe.exe')
  fs.writeFileSync(file, 'MZ but not really a program')
  try {
    assert.equal(await exeIcon(file), null)
    assert.equal(await exeIcon(path.join(os.tmpdir(), 'devxplorer-missing.exe')), null)
  } finally { fs.rmSync(file) }
})

test('a resource directory that points to itself does not hang', async () => {
  const buf = Buffer.alloc(0x600)
  buf.write('MZ', 0, 'latin1')
  buf.writeUInt32LE(64, 0x3c)
  buf.writeUInt32LE(0x4550, 64) // PE signature
  buf.writeUInt16LE(1, 64 + 6) // one section
  buf.writeUInt16LE(240, 64 + 20) // optional header size
  buf.writeUInt16LE(0x20b, 64 + 24) // PE32+
  buf.writeUInt32LE(0x1000, 64 + 24 + 128) // resource directory RVA
  const section = 64 + 24 + 240
  buf.writeUInt32LE(0x200, section + 8)
  buf.writeUInt32LE(0x1000, section + 12)
  buf.writeUInt32LE(0x200, section + 16)
  buf.writeUInt32LE(0x400, section + 20)
  const rsrc = 0x400
  buf.writeUInt16LE(2, rsrc + 14) // root: group icons and icons
  buf.writeUInt32LE(14, rsrc + 16)
  buf.writeUInt32LE(0x80000030, rsrc + 20)
  buf.writeUInt32LE(3, rsrc + 24)
  buf.writeUInt32LE(0x80000030, rsrc + 28)
  buf.writeUInt16LE(1, rsrc + 0x30 + 14) // a directory whose only entry is itself
  buf.writeUInt32LE(1, rsrc + 0x30 + 16)
  buf.writeUInt32LE(0x80000030, rsrc + 0x30 + 20)
  const file = path.join(os.tmpdir(), 'devxplorer-loop.exe')
  fs.writeFileSync(file, buf)
  try { assert.equal(await exeIcon(file), null) } finally { fs.rmSync(file) }
})
