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
