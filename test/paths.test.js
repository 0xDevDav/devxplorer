const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { validName, uniquePath } = require('../src/main/paths')
const { putBack } = require('../src/main/recycle')

test('rejects names Windows cannot handle', () => {
  for (const name of ['CON', 'nul', 'Aux.txt', 'com1', 'LPT9.log', 'a:b', 'trailing.', 'trailing ', '']) assert.equal(validName(name), false, name)
  for (const name of ['console', 'nullo.txt', 'com10', 'report.docx', '.gitignore']) assert.equal(validName(name), true, name)
})

test('finds free names, keeping dots in folder names whole', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-paths-'))
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), '')
    fs.mkdirSync(path.join(root, 'v1.2'))
    assert.equal(uniquePath(path.join(root, 'b.txt')), path.join(root, 'b.txt'))
    assert.equal(uniquePath(path.join(root, 'a.txt')), path.join(root, 'a (2).txt'))
    assert.equal(uniquePath(path.join(root, 'v1.2')), path.join(root, 'v1.2 (2)'))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('restoring from the bin never replaces a newer file with the same name', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-bin-'))
  try {
    const bin = path.join(root, 'bin')
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(bin, '$RABC.docx'), 'old')
    fs.writeFileSync(path.join(bin, '$IABC.docx'), 'index')
    const original = path.join(root, 'report.docx')
    fs.writeFileSync(original, 'new')
    const restored = await putBack(bin, 'ABC.docx', original)
    assert.equal(fs.readFileSync(original, 'utf8'), 'new')
    assert.equal(restored, path.join(root, 'report (2).docx'))
    assert.equal(fs.readFileSync(restored, 'utf8'), 'old')
    assert.equal(fs.existsSync(path.join(bin, '$IABC.docx')), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
