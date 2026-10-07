const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { powershell, zip, unzip } = require('../src/main/powershell')

const windows = { skip: process.platform !== 'win32' }

test('values reach the script as data, never as code', windows, async () => {
  for (const value of ["it's", 'Anna’s x’; Write-Output pwned; ’', '$(Write-Output pwned)', '"; exit 1; "']) {
    assert.equal((await powershell('[Console]::Out.Write($env:DX_V)', { V: value })), value)
  }
})

test('zips files and folders and extracts them back', windows, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-zip-'))
  try {
    const folder = path.join(root, 'cartella di Dav’id')
    fs.mkdirSync(path.join(folder, 'vuota'), { recursive: true })
    fs.writeFileSync(path.join(folder, 'dentro.txt'), 'ciao')
    const file = path.join(root, "note's.txt")
    fs.writeFileSync(file, 'testo')
    const archive = path.join(root, 'out.zip')
    await zip([file, folder], archive)

    const dest = path.join(root, 'out')
    await unzip(archive, dest)
    assert.equal(fs.readFileSync(path.join(dest, "note's.txt"), 'utf8'), 'testo')
    assert.equal(fs.readFileSync(path.join(dest, 'cartella di Dav’id', 'dentro.txt'), 'utf8'), 'ciao')
    assert.ok(fs.statSync(path.join(dest, 'cartella di Dav’id', 'vuota')).isDirectory())
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('a failed zip leaves no partial archive', windows, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-zip-'))
  try {
    const archive = path.join(root, 'out.zip')
    await assert.rejects(zip([path.join(root, 'missing.txt')], archive))
    assert.equal(fs.existsSync(archive), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
