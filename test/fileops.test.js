const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const fileOps = require('../src/main/fileops')

const ops = fileOps({ t: key => key })
const fsp = fs.promises

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dx-ops-'))
}

// Replaces fs.promises[name] while fn runs.
async function withStub(name, stub, fn) {
  const original = fsp[name]
  fsp[name] = (...args) => stub(original, ...args)
  try { return await fn() } finally { fsp[name] = original }
}

test('a swap that fails halfway puts every name back', async () => {
  const dir = tempDir()
  try {
    const a = path.join(dir, 'a.txt')
    const b = path.join(dir, 'b.txt')
    fs.writeFileSync(a, 'A')
    fs.writeFileSync(b, 'B')
    let calls = 0
    // The fourth rename is the second item reaching its target.
    await withStub('rename', (rename, from, to) => ++calls === 4 ? Promise.reject(new Error('locked')) : rename(from, to), () =>
      assert.rejects(ops.renameMany([[a, 'b.txt'], [b, 'a.txt']]), /locked/))
    assert.deepEqual(fs.readdirSync(dir).sort(), ['a.txt', 'b.txt'])
    assert.equal(fs.readFileSync(a, 'utf8'), 'A')
    assert.equal(fs.readFileSync(b, 'utf8'), 'B')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('a swap renames both items', async () => {
  const dir = tempDir()
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'A')
    fs.writeFileSync(path.join(dir, 'b.txt'), 'B')
    await ops.renameMany([[path.join(dir, 'a.txt'), 'b.txt'], [path.join(dir, 'b.txt'), 'a.txt']])
    assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'B')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('a batch that fails halfway reports what it completed', async () => {
  const dir = tempDir()
  try {
    const dest = path.join(dir, 'dest')
    fs.mkdirSync(dest)
    const files = ['1.txt', '2.txt', '3.txt'].map(n => { fs.writeFileSync(path.join(dir, n), n); return path.join(dir, n) })
    const result = await withStub('rename', (rename, from, to) => from.endsWith('2.txt') ? Promise.reject(new Error('busy')) : rename(from, to), () =>
      ops.move(files, dest))
    assert.equal(result.error, 'busy')
    assert.deepEqual(result.done, [[files[0], path.join(dest, '1.txt')]])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('moving across drives keeps dates and leaves nothing behind on failure', async () => {
  const dir = tempDir()
  try {
    const src = path.join(dir, 'photo.jpg')
    fs.writeFileSync(src, 'x')
    const old = new Date('2020-05-01T10:00:00Z')
    fs.utimesSync(src, old, old)
    const crossDrive = rename => Object.assign(new Error('cross-device'), { code: 'EXDEV' })
    const dest = path.join(dir, 'moved.jpg')
    await withStub('rename', (rename) => Promise.reject(crossDrive(rename)), () => ops.moveItem(src, dest))
    assert.equal(fs.existsSync(src), false)
    assert.equal(fs.statSync(dest).mtimeMs, old.getTime())

    const folder = path.join(dir, 'folder')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'a.txt'), 'a')
    const target = path.join(dir, 'copy')
    await withStub('rename', (rename) => Promise.reject(crossDrive(rename)), () =>
      withStub('cp', async (cp, from, to, options) => { await fsp.mkdir(to); throw new Error('disk full') }, () =>
        assert.rejects(ops.moveItem(folder, target), /disk full/)))
    assert.equal(fs.existsSync(target), false)
    assert.equal(fs.existsSync(path.join(folder, 'a.txt')), true)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
